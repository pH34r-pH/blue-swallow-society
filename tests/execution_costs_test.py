import unittest
from datetime import datetime, timezone

from paper_engine_test import fresh_snapshot, load_engine


class ExecutionCostAccountingTests(unittest.TestCase):
    def setUp(self):
        self.engine = load_engine()
        self.now = datetime(2026, 7, 13, 1, 0, tzinfo=timezone.utc)

    def test_cost_model_is_asset_specific_and_round_trip_is_explicit(self):
        crypto = self.engine.execution_cost_model({"instrument_type": "crypto"})
        equity = self.engine.execution_cost_model({"instrument_type": "equity"})
        prediction = self.engine.execution_cost_model({"instrument_type": "prediction_market"})

        self.assertEqual(crypto["model_version"], "bss.execution_costs.v1")
        self.assertGreater(crypto["fee_bps"], equity["fee_bps"])
        self.assertGreater(prediction["half_spread_bps"], equity["half_spread_bps"])
        self.assertEqual(
            self.engine.estimate_round_trip_cost_bps({"instrument_type": "crypto"}),
            2 * sum(crypto[field] for field in self.engine.COST_BPS_FIELDS),
        )

    def test_explicit_cost_overrides_are_applied_and_invalid_values_fail_closed(self):
        instrument = {
            "instrument_type": "crypto",
            "fee_bps": 12.0,
            "half_spread_bps": 3.0,
            "slippage_bps": 4.0,
            "market_impact_bps": 5.0,
            "latency_bps": 6.0,
        }
        model = self.engine.execution_cost_model(instrument)
        self.assertEqual([model[field] for field in self.engine.COST_BPS_FIELDS], [12.0, 3.0, 4.0, 5.0, 6.0])
        for value in (-1, float("nan"), "10"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.engine.execution_cost_model({**instrument, "fee_bps": value})

    def test_round_trip_at_an_unchanged_mark_loses_fees_and_execution_friction(self):
        ledger = self.engine.default_ledger(self.now)
        book = next(book for book in ledger["books"] if book["book_id"] == "standard__crypto")
        quote = next(item for item in fresh_snapshot(self.now)["instruments"] if item["instrument_ref"] == "crypto:bitcoin")
        buy_decision = self.engine._decision(
            run_key="cost-buy", book=book, action="PAPER_BUY", status="paper_filled", now=self.now,
            instrument=quote, paper_size=1000.0, checks=["paper_only"], risk_passed=True,
            reason="cost test",
        )
        buy = self.engine._execute_buy(book, quote, 1000.0, buy_decision, self.now)
        bought_quantity = buy["quantity"]
        sell_decision = self.engine._decision(
            run_key="cost-sell", book=book, action="PAPER_SELL", status="paper_filled", now=self.now,
            instrument=quote, paper_size=bought_quantity * quote["mark_price"], checks=["paper_only"], risk_passed=True,
            reason="cost test",
        )
        sell = self.engine._execute_sell(book, quote, bought_quantity * quote["mark_price"], sell_decision, self.now)

        self.assertIsNotNone(sell)
        self.assertGreater(buy["total_transaction_cost"], 0)
        self.assertGreater(sell["total_transaction_cost"], 0)
        self.assertLess(book["cash_balance"], 2000.0)
        self.assertLess(book["realized_pnl"], 0)
        self.assertAlmostEqual(book["transaction_costs"], buy["total_transaction_cost"] + sell["total_transaction_cost"], places=2)
        self.assertAlmostEqual(book["turnover_notional"], buy["gross_notional"] + sell["gross_notional"], places=2)

    def test_fresh_24_book_tick_debits_costs_and_exposes_fill_attribution(self):
        result = self.engine.process_tick(
            self.engine.default_ledger(self.now),
            fresh_snapshot(self.now),
            now=self.now,
            run_idempotency_key="costed-24-book-tick",
        )
        fills = [event for event in result["events"] if event["event_type"] == "paper_fill"]
        self.assertGreaterEqual(len(fills), 24)
        self.assertTrue(all(event["cost_model_version"] == "bss.execution_costs.v1" for event in fills))
        self.assertTrue(all(event["execution_price"] > 0 for event in fills))
        self.assertTrue(all(event["total_transaction_cost"] >= event["fee_amount"] >= 0 for event in fills))
        self.assertTrue(all(book["transaction_costs"] > 0 for book in result["ledger"]["books"]))
        self.assertTrue(all(self.engine.summarize_book(book)["equity"] < 2000 for book in result["ledger"]["books"]))

    def test_malformed_cost_override_blocks_instrument_without_aborting_tick(self):
        snapshot = fresh_snapshot(self.now)
        bitcoin = next(item for item in snapshot["instruments"] if item["instrument_ref"] == "crypto:bitcoin")
        bitcoin["fee_bps"] = "bad"
        result = self.engine.process_tick(
            self.engine.default_ledger(self.now), snapshot, now=self.now, run_idempotency_key="malformed-cost"
        )
        self.assertFalse(any(event.get("instrument_ref") == "crypto:bitcoin" for event in result["events"]))

    def test_persisted_cost_counters_are_nonnegative_and_reconciled(self):
        for mutation in (
            {"fees_paid": -1.0},
            {"turnover_notional": -1.0},
            {"fees_paid": 1.0, "transaction_costs": 50.0},
        ):
            ledger = self.engine.default_ledger(self.now)
            ledger["books"][0].update(mutation)
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                self.engine.migrate_ledger(ledger, self.now)

    def test_explicit_prediction_settlement_uses_contractual_payoff_without_execution_friction(self):
        ledger = self.engine.default_ledger(self.now)
        book = next(book for book in ledger["books"] if book["book_id"] == "standard__prediction_markets")
        quote = next(item for item in fresh_snapshot(self.now)["instruments"] if item["instrument_type"] == "prediction_market")
        buy_decision = self.engine._decision(
            run_key="settlement-buy", book=book, action="PAPER_BUY", status="paper_filled", now=self.now,
            instrument=quote, paper_size=500.0, checks=["paper_only"], risk_passed=True, reason="settlement test",
        )
        buy = self.engine._execute_buy(book, quote, 500.0, buy_decision, self.now)
        transaction_costs_before = book["transaction_costs"]
        cash_before = book["cash_balance"]
        settled = {**quote, "mark_price": 1.0, "settled": True}
        decisions, fills = self.engine._settle_terminal_positions(book, {quote["instrument_ref"]: settled}, self.now, "settlement")
        self.assertEqual(len(decisions), 1)
        self.assertEqual(len(fills), 1)
        self.assertEqual(fills[0]["total_transaction_cost"], 0.0)
        self.assertEqual(fills[0]["reference_price"], 1.0)
        self.assertEqual(fills[0]["execution_price"], 1.0)
        self.assertAlmostEqual(book["cash_balance"], cash_before + buy["quantity"], places=2)
        self.assertEqual(book["transaction_costs"], transaction_costs_before)


if __name__ == "__main__":
    unittest.main()
