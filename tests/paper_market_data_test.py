import importlib.util
import unittest
from datetime import datetime, timezone
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "mosaic_murmurs_market_data.py"


def load_module():
    spec = importlib.util.spec_from_file_location("mosaic_murmurs_market_data", MODULE_PATH)
    if spec is None or spec.loader is None:
        raise AssertionError(f"Unable to load {MODULE_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PaperMarketDataTests(unittest.TestCase):
    def setUp(self):
        self.module = load_module()
        self.now = datetime(2026, 7, 13, 1, 0, tzinfo=timezone.utc)

    def test_cboe_quote_preserves_delayed_trade_time_and_book_tags(self):
        payload = {
            "timestamp": "2026-07-12 17:06:54",
            "data": {
                "symbol": "MSFT",
                "security_type": "stock",
                "current_price": 385.38,
                "price_change_percent": 0.1922,
                "close": 385.1,
                "volume": 24644605,
                "last_trade_time": "2026-07-10T15:59:59",
            },
        }

        quote = self.module.parse_cboe_quote(payload, self.now, ["equity_watch", "local_event_watch"])

        self.assertEqual(quote["instrument_ref"], "equity:MSFT")
        self.assertEqual(quote["mark_price"], 385.38)
        self.assertEqual(quote["previous_close"], 385.1)
        self.assertEqual(quote["as_of"], "2026-07-10T15:59:59Z")
        self.assertEqual(quote["book_tags"], ["equity_watch", "local_event_watch"])
        self.assertEqual(quote["momentum_score"], 0.1922)

    def test_coingecko_payload_becomes_tradeable_crypto_instruments(self):
        payload = [
            {
                "id": "bitcoin",
                "symbol": "btc",
                "name": "Bitcoin",
                "current_price": 64000,
                "price_change_percentage_24h": 2.0,
                "price_change_percentage_7d_in_currency": 5.0,
                "total_volume": 1000000000,
                "market_cap_rank": 1,
                "last_updated": "2026-07-13T00:59:00Z",
            }
        ]

        [quote] = self.module.parse_coingecko_markets(payload, self.now)

        self.assertEqual(quote["instrument_ref"], "crypto:bitcoin")
        self.assertEqual(quote["symbol"], "BTC")
        self.assertEqual(
            quote["book_tags"],
            ["crypto", "cross_asset_momentum", "contrarian_reversion", "volatility_barbell"],
        )
        self.assertGreater(quote["momentum_score"], 0)
        self.assertEqual(quote["as_of"], "2026-07-13T00:59:00Z")

    def test_polymarket_binary_market_keeps_numeric_yes_and_no_marks(self):
        payload = [
            {
                "id": "market-1",
                "question": "Will the test pass?",
                "slug": "will-the-test-pass",
                "outcomes": '["Yes", "No"]',
                "outcomePrices": '["0.42", "0.58"]',
                "liquidity": "100000",
                "volume24hr": "20000",
                "updatedAt": "2026-07-13T00:58:00Z",
                "endDate": "2026-08-01T00:00:00Z",
            }
        ]

        quotes = self.module.parse_polymarket_markets(payload, self.now)

        self.assertEqual([quote["instrument_ref"] for quote in quotes], ["polymarket:market-1:YES", "polymarket:market-1:NO"])
        self.assertEqual([quote["mark_price"] for quote in quotes], [0.42, 0.58])
        self.assertTrue(all(quote["liquidity"] == 100000 for quote in quotes))
        self.assertTrue(all(quote["book_tags"] == ["prediction_markets"] for quote in quotes))

    def test_polymarket_explicit_closed_binary_market_keeps_zero_and_one_settlement_marks(self):
        payload = [
            {
                "id": "settled-market",
                "question": "Did the event happen?",
                "slug": "did-the-event-happen",
                "outcomes": '["Yes", "No"]',
                "outcomePrices": '["1", "0"]',
                "closed": True,
                "updatedAt": "2026-07-13T00:58:00Z",
            }
        ]

        quotes = self.module.parse_polymarket_markets(payload, self.now)

        self.assertEqual([quote["mark_price"] for quote in quotes], [1.0, 0.0])
        self.assertTrue(all(quote["settled"] is True for quote in quotes))

    def test_polymarket_does_not_fabricate_settlement_from_zero_or_one_prices(self):
        payload = [
            {
                "id": "not-explicitly-settled",
                "outcomes": ["Yes", "No"],
                "outcomePrices": [1, 0],
                "updatedAt": "2026-07-13T00:58:00Z",
            }
        ]

        self.assertEqual(self.module.parse_polymarket_markets(payload, self.now), [])

    def test_collect_snapshot_fetches_held_prediction_ids_independently_and_deterministically(self):
        calls = []

        def market(market_id, *, settled=False):
            return {
                "id": market_id,
                "question": market_id,
                "slug": market_id,
                "outcomes": ["Yes", "No"],
                "outcomePrices": [1, 0] if settled else [0.4, 0.6],
                "closed": settled,
                "updatedAt": "2026-07-13T00:58:00Z",
            }

        def fetcher(url, timeout):
            calls.append((url, timeout))
            if url == self.module.POLYMARKET_URL:
                return [market("active-market")]
            if url.endswith("/markets/held-a"):
                return market("held-a", settled=True)
            if url.endswith("/markets/held-z"):
                return market("held-z", settled=True)
            if url == self.module.COINGECKO_URL:
                return []
            return {}

        snapshot = self.module.collect_market_snapshot(
            self.now,
            timeout=7,
            fetcher=fetcher,
            held_prediction_market_ids=["held-z", "held-a", "held-z"],
        )

        held_calls = [url for url, _ in calls if "/markets/held-" in url]
        self.assertEqual(held_calls, [
            "https://gamma-api.polymarket.com/markets/held-a",
            "https://gamma-api.polymarket.com/markets/held-z",
        ])
        refs = {item["instrument_ref"] for item in snapshot["instruments"]}
        self.assertIn("polymarket:active-market:YES", refs)
        self.assertIn("polymarket:held-a:YES", refs)
        self.assertIn("polymarket:held-z:NO", refs)

    def test_extracts_held_prediction_market_ids_from_ledger_positions(self):
        ledger = {
            "books": [
                {
                    "positions": [
                        {"instrument_type": "prediction_market", "market_id": "market-z"},
                        {"instrument_type": "prediction_market", "instrument_ref": "polymarket:market-a:YES"},
                        {"instrument_type": "prediction_market", "instrument_ref": "polymarket:market-a:NO"},
                        {"instrument_type": "crypto", "instrument_ref": "crypto:bitcoin"},
                    ]
                }
            ]
        }

        self.assertEqual(self.module.held_prediction_market_ids(ledger), ["market-a", "market-z"])


if __name__ == "__main__":
    unittest.main()
