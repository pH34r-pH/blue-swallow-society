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
        self.assertEqual(quote["book_tags"], ["crypto"])
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


if __name__ == "__main__":
    unittest.main()
