import copy
import importlib.util
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "mosaic_murmurs_paper_engine.py"


def load_engine():
    spec = importlib.util.spec_from_file_location("mosaic_murmurs_paper_engine", MODULE_PATH)
    if spec is None or spec.loader is None:
        raise AssertionError(f"Unable to load {MODULE_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def iso_z(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def instrument(
    ref,
    instrument_type,
    symbol,
    mark,
    now,
    book_tags,
    *,
    momentum=1.0,
    market_id=None,
    outcome=None,
    liquidity=0.0,
):
    return {
        "instrument_ref": ref,
        "instrument_type": instrument_type,
        "symbol": symbol,
        "title": symbol,
        "mark_price": mark,
        "previous_close": mark,
        "momentum_score": momentum,
        "market_id": market_id,
        "outcome": outcome,
        "liquidity": liquidity,
        "retrieved_at": iso_z(now),
        "as_of": iso_z(now),
        "source_id": f"test_{instrument_type}",
        "source_url": f"https://example.test/{ref}",
        "book_tags": book_tags,
    }


def fresh_snapshot(now):
    instruments = [
        instrument(
            "polymarket:market-1:YES",
            "prediction_market",
            "YES",
            0.4,
            now,
            ["prediction_markets"],
            market_id="market-1",
            outcome="YES",
            liquidity=1_000_000,
        ),
        instrument(
            "polymarket:market-1:NO",
            "prediction_market",
            "NO",
            0.6,
            now,
            ["prediction_markets"],
            market_id="market-1",
            outcome="NO",
            liquidity=1_000_000,
        ),
        instrument("crypto:bitcoin", "crypto", "BTC", 100.0, now, ["crypto"], momentum=4.0),
        instrument("crypto:ethereum", "crypto", "ETH", 50.0, now, ["crypto"], momentum=2.0),
        instrument("crypto:solana", "crypto", "SOL", 20.0, now, ["crypto"], momentum=1.0),
        instrument("equity:SPY", "equity", "SPY", 600.0, now, ["equity_watch"], momentum=1.5),
        instrument("equity:QQQ", "equity", "QQQ", 550.0, now, ["equity_watch"], momentum=2.0),
        instrument("equity:MSFT", "equity", "MSFT", 400.0, now, ["equity_watch", "local_event_watch"], momentum=2.5),
        instrument("equity:AMZN", "equity", "AMZN", 250.0, now, ["local_event_watch"], momentum=1.0),
        instrument("equity:COST", "equity", "COST", 900.0, now, ["local_event_watch"], momentum=0.5),
        instrument("equity:SBUX", "equity", "SBUX", 100.0, now, ["local_event_watch"], momentum=0.25),
        instrument("equity:BA", "equity", "BA", 220.0, now, ["local_event_watch"], momentum=0.75),
        instrument("equity:HACK", "equity", "HACK", 110.0, now, ["ai_cyber_watch"], momentum=2.0),
        instrument("equity:CIBR", "equity", "CIBR", 90.0, now, ["ai_cyber_watch"], momentum=1.5),
        instrument("equity:AIQ", "equity", "AIQ", 64.0, now, ["ai_cyber_watch"], momentum=1.0),
    ]
    return {
        "schema_version": 1,
        "generated_at": iso_z(now),
        "instruments": instruments,
        "errors": [],
    }


class AutonomousPaperEngineTests(unittest.TestCase):
    def setUp(self):
        self.engine = load_engine()
        self.now = datetime(2026, 7, 13, 1, 0, tzinfo=timezone.utc)

    def test_first_fresh_tick_contributes_and_invests_one_thousand_per_book(self):
        result = self.engine.process_tick(
            self.engine.default_ledger(self.now),
            fresh_snapshot(self.now),
            now=self.now,
            run_idempotency_key="tick-1",
        )

        self.assertEqual(len(result["ledger"]["books"]), 5)
        for book in result["ledger"]["books"]:
            summary = self.engine.summarize_book(book)
            self.assertEqual(summary["starting_balance"], 2000.0)
            self.assertEqual(summary["cash_balance"], 1000.0)
            self.assertEqual(summary["gross_paper_exposure"], 1000.0)
            self.assertEqual(summary["equity"], 2000.0)
            self.assertTrue(book["initial_allocation_complete"])
            accepted = [
                decision
                for decision in result["decisions"]
                if decision["book_id"] == book["book_id"] and decision["status"] == "paper_filled"
            ]
            self.assertEqual(sum(decision["paper_size"] for decision in accepted), 1000.0)
            self.assertTrue(all(decision["action"] == "PAPER_BUY" for decision in accepted))
            self.assertTrue(all(decision["paper_only"] for decision in accepted))
            self.assertTrue(all(decision["autonomous_execution"] for decision in accepted))
            self.assertTrue(all(decision["risk_policy_passed"] for decision in accepted))
            self.assertTrue(all(not decision["human_review_required"] for decision in accepted))

        fills = [event for event in result["events"] if event["event_type"] == "paper_fill"]
        self.assertEqual(len(fills), 16)

    def test_replaying_the_same_tick_is_idempotent(self):
        first = self.engine.process_tick(
            self.engine.default_ledger(self.now),
            fresh_snapshot(self.now),
            now=self.now,
            run_idempotency_key="same-tick",
        )
        replay = self.engine.process_tick(
            first["ledger"],
            fresh_snapshot(self.now),
            now=self.now,
            run_idempotency_key="same-tick",
        )

        self.assertEqual(replay["decisions"], [])
        self.assertEqual(replay["events"], [])
        self.assertEqual(replay["ledger"], first["ledger"])

    def test_stale_marks_block_initial_allocation_without_fabricated_positions(self):
        snapshot = fresh_snapshot(self.now)
        stale_at = self.now - timedelta(hours=120)
        snapshot["generated_at"] = iso_z(stale_at)
        for item in snapshot["instruments"]:
            item["retrieved_at"] = iso_z(stale_at)
            item["as_of"] = iso_z(stale_at)

        result = self.engine.process_tick(
            self.engine.default_ledger(self.now),
            snapshot,
            now=self.now,
            run_idempotency_key="stale-tick",
        )

        for book in result["ledger"]["books"]:
            summary = self.engine.summarize_book(book)
            self.assertEqual(summary["cash_balance"], 2000.0)
            self.assertEqual(summary["gross_paper_exposure"], 0.0)
            self.assertFalse(book["initial_allocation_complete"])
        self.assertTrue(result["decisions"])
        self.assertTrue(all(decision["action"] == "AVOID" for decision in result["decisions"]))
        self.assertTrue(all(not decision["risk_policy_passed"] for decision in result["decisions"]))
        self.assertTrue(all("stale" in " ".join(decision["risk_policy_checks"]).lower() for decision in result["decisions"]))
        self.assertFalse(any(event["event_type"] == "paper_fill" for event in result["events"]))

    def test_negative_momentum_exits_crypto_positions_and_realizes_pnl(self):
        seeded = self.engine.process_tick(
            self.engine.default_ledger(self.now),
            fresh_snapshot(self.now),
            now=self.now,
            run_idempotency_key="seed",
        )
        later = self.now + timedelta(hours=2)
        snapshot = fresh_snapshot(later)
        crypto_marks = {
            "crypto:bitcoin": 110.0,
            "crypto:ethereum": 45.0,
            "crypto:solana": 18.0,
        }
        for item in snapshot["instruments"]:
            if item["instrument_ref"] in crypto_marks:
                item["mark_price"] = crypto_marks[item["instrument_ref"]]
                item["momentum_score"] = -3.0

        result = self.engine.process_tick(
            seeded["ledger"],
            snapshot,
            now=later,
            run_idempotency_key="risk-off",
        )
        crypto_book = next(book for book in result["ledger"]["books"] if book["book_id"] == "crypto")
        crypto_decisions = [decision for decision in result["decisions"] if decision["book_id"] == "crypto"]

        self.assertEqual(crypto_book["positions"], [])
        self.assertTrue(any(decision["action"] == "PAPER_SELL" for decision in crypto_decisions))
        self.assertFalse(any(decision["action"] == "PAPER_BUY" for decision in crypto_decisions))
        self.assertNotEqual(crypto_book["realized_pnl"], 0.0)
        self.assertEqual(self.engine.summarize_book(crypto_book)["cash_balance"], self.engine.summarize_book(crypto_book)["equity"])

    def test_drawdown_stop_blocks_buys_but_allows_risk_reducing_sells(self):
        seeded = self.engine.process_tick(
            self.engine.default_ledger(self.now),
            fresh_snapshot(self.now),
            now=self.now,
            run_idempotency_key="seed",
        )
        later = self.now + timedelta(hours=2)
        snapshot = fresh_snapshot(later)
        for item in snapshot["instruments"]:
            if "ai_cyber_watch" in item["book_tags"]:
                item["mark_price"] *= 0.7
                item["momentum_score"] = 5.0

        result = self.engine.process_tick(
            seeded["ledger"],
            snapshot,
            now=later,
            run_idempotency_key="drawdown",
        )
        decisions = [decision for decision in result["decisions"] if decision["book_id"] == "ai_cyber_watch"]
        book = next(book for book in result["ledger"]["books"] if book["book_id"] == "ai_cyber_watch")

        self.assertGreaterEqual(self.engine.summarize_book(book)["drawdown_pct"], 10.0)
        self.assertFalse(any(decision["action"] == "PAPER_BUY" and decision["status"] == "paper_filled" for decision in decisions))
        self.assertTrue(any(decision["action"] == "PAPER_SELL" and decision["status"] == "paper_filled" for decision in decisions))

    def test_schema_two_flat_ledger_receives_additional_capital_once(self):
        legacy = {
            "schema_version": 2,
            "currency": "USD",
            "books": [
                {
                    "book_id": book_id,
                    "starting_balance": 1000.0,
                    "cash_balance": 1000.0,
                    "positions": [],
                }
                for book_id in self.engine.BOOK_IDS
            ],
        }

        migrated = self.engine.migrate_ledger(legacy, self.now)
        migrated_again = self.engine.migrate_ledger(copy.deepcopy(migrated), self.now)

        self.assertEqual(migrated_again, migrated)
        self.assertTrue(all(book["starting_balance"] == 2000.0 for book in migrated["books"]))
        self.assertTrue(all(book["cash_balance"] == 2000.0 for book in migrated["books"]))
        self.assertTrue(all(book["additional_capital_contribution"] == 1000.0 for book in migrated["books"]))
        self.assertTrue(all(book["funding_migration_applied"] for book in migrated["books"]))


if __name__ == "__main__":
    unittest.main()
