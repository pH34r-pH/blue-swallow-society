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
    for item in instruments:
        tags = item["book_tags"]
        if item["instrument_type"] in {"crypto", "equity"}:
            tags.extend(["cross_asset_momentum", "contrarian_reversion"])
        if item.get("symbol") in {"SPY", "SOL", "AIQ"}:
            tags.append("volatility_barbell")
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

    def seed(self, key="seed"):
        return self.engine.process_tick(
            self.engine.default_ledger(self.now),
            fresh_snapshot(self.now),
            now=self.now,
            run_idempotency_key=key,
        )

    def test_first_fresh_tick_creates_three_by_eight_matrix_and_debits_realistic_execution_costs(self):
        result = self.seed("tick-1")

        self.assertEqual(result["ledger"]["schema_version"], 4)
        self.assertEqual(len(result["ledger"]["books"]), 24)
        self.assertEqual(
            {book["line_id"] for book in result["ledger"]["books"]},
            {"standard", "aggressive", "hyper_aggressive"},
        )
        self.assertEqual(len({book["strategy_id"] for book in result["ledger"]["books"]}), 8)
        self.assertEqual(len({book["book_id"] for book in result["ledger"]["books"]}), 24)
        for book in result["ledger"]["books"]:
            summary = self.engine.summarize_book(book)
            self.assertEqual(summary["starting_balance"], 2000.0)
            self.assertEqual(summary["gross_paper_exposure"], 1000.0)
            self.assertGreater(summary["transaction_costs"], 0.0)
            self.assertAlmostEqual(summary["cash_balance"], 1000.0 - summary["transaction_costs"], delta=0.03)
            self.assertAlmostEqual(summary["equity"], 2000.0 - summary["transaction_costs"], delta=0.03)
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
        self.assertGreaterEqual(len(fills), 24)
        self.assertAlmostEqual(sum(event["paper_size"] for event in fills), 24_000.0, places=2)

    def test_replaying_the_same_tick_is_idempotent(self):
        first = self.seed("same-tick")
        replay = self.engine.process_tick(
            first["ledger"],
            fresh_snapshot(self.now),
            now=self.now,
            run_idempotency_key="same-tick",
        )

        self.assertEqual(replay["decisions"], [])
        self.assertEqual(replay["events"], [])
        self.assertEqual(replay["ledger"], first["ledger"])

    def test_old_idempotency_keys_remain_durable_and_replay_emits_nothing(self):
        ledger = self.engine.default_ledger(self.now)
        old_key = "oldest-retained-key"
        ledger["processed_idempotency_keys"] = [old_key, *[f"later-key-{index}" for index in range(600)]]

        replay = self.engine.process_tick(
            ledger,
            fresh_snapshot(self.now),
            now=self.now,
            run_idempotency_key=old_key,
        )

        self.assertTrue(replay["replayed"])
        self.assertEqual(replay["decisions"], [])
        self.assertEqual(replay["events"], [])
        self.assertEqual(replay["ledger"]["processed_idempotency_keys"], ledger["processed_idempotency_keys"])

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
        self.assertFalse(any(event["event_type"] == "paper_fill" for event in result["events"]))

    def test_negative_momentum_rotates_but_does_not_cash_out_crypto_lines(self):
        seeded = self.seed()
        later = self.now + timedelta(hours=2)
        snapshot = fresh_snapshot(later)
        marks = {"crypto:bitcoin": 110.0, "crypto:ethereum": 45.0, "crypto:solana": 18.0}
        for item in snapshot["instruments"]:
            if item["instrument_ref"] in marks:
                item["mark_price"] = marks[item["instrument_ref"]]
                item["momentum_score"] = -3.0

        result = self.engine.process_tick(
            seeded["ledger"], snapshot, now=later, run_idempotency_key="negative-momentum"
        )

        expected = {"standard": 0.80, "aggressive": 0.95, "hyper_aggressive": 1.0}
        for line_id, fraction in expected.items():
            book = next(book for book in result["ledger"]["books"] if book["book_id"] == f"{line_id}__crypto")
            summary = self.engine.summarize_book(book)
            self.assertLessEqual(
                abs(summary["gross_paper_exposure"] - summary["equity"] * fraction),
                summary["transaction_costs"] + 0.1,
            )
            self.assertTrue(book["positions"])
            self.assertLess(summary["cash_balance"], summary["equity"])

    def test_aggression_profiles_increase_concentration_and_deploy_the_bank(self):
        seeded = self.seed()
        later = self.now + timedelta(hours=2)
        result = self.engine.process_tick(
            seeded["ledger"],
            fresh_snapshot(later),
            now=later,
            run_idempotency_key="profile-rebalance",
        )

        expectations = {
            "standard": (0.80, 3),
            "aggressive": (0.95, 2),
            "hyper_aggressive": (1.0, 1),
        }
        for line_id, (fraction, max_positions) in expectations.items():
            book = next(book for book in result["ledger"]["books"] if book["book_id"] == f"{line_id}__crypto")
            summary = self.engine.summarize_book(book)
            self.assertLessEqual(
                abs(summary["gross_paper_exposure"] - summary["equity"] * fraction),
                summary["transaction_costs"] + 0.1,
            )
            self.assertLessEqual(summary["open_position_count"], max_positions)

    def test_explicit_prediction_settlement_can_crash_a_book_and_requires_postmortem(self):
        ledger = self.engine.default_ledger(self.now)
        book = next(book for book in ledger["books"] if book["book_id"] == "hyper_aggressive__prediction_markets")
        book.update({
            "cash_balance": 0.0,
            "initial_allocation_complete": True,
            "positions": [{
                "position_id": "position-crash",
                "instrument_ref": "polymarket:market-1:YES",
                "instrument_type": "prediction_market",
                "market_id": "market-1",
                "outcome": "YES",
                "symbol": "YES",
                "title": "YES",
                "quantity": 5000.0,
                "entry_price": 0.4,
                "mark_price": 0.4,
                "previous_mark_price": 0.4,
                "cost_basis": 2000.0,
                "market_value": 2000.0,
                "mark_status": "fresh",
                "opened_at": iso_z(self.now),
                "updated_at": iso_z(self.now),
            }],
            "equity": 2000.0,
        })
        later = self.now + timedelta(hours=2)
        snapshot = fresh_snapshot(later)
        doomed = next(item for item in snapshot["instruments"] if item["instrument_ref"] == "polymarket:market-1:YES")
        doomed.update({"mark_price": 0.0, "settled": True})
        winner = next(item for item in snapshot["instruments"] if item["instrument_ref"] == "polymarket:market-1:NO")
        winner.update({"mark_price": 1.0, "settled": True})

        result = self.engine.process_tick(ledger, snapshot, now=later, run_idempotency_key="crash")
        crashed = next(book for book in result["ledger"]["books"] if book["book_id"] == "hyper_aggressive__prediction_markets")
        decisions = [decision for decision in result["decisions"] if decision["book_id"] == crashed["book_id"]]

        self.assertEqual(self.engine.summarize_book(crashed)["equity"], 0.0)
        self.assertEqual(crashed["status"], "crashed")
        self.assertTrue(crashed["postmortem_required"])
        self.assertIsNotNone(crashed["crashed_at"])
        self.assertEqual([decision["action"] for decision in decisions], ["PAPER_SELL", "POSTMORTEM_REQUIRED"])
        self.assertTrue(decisions[-1]["human_review_required"])

    def test_legacy_five_book_ledger_is_archived_and_new_matrix_starts_fresh_once(self):
        legacy_ids = ["prediction_markets", "crypto", "equity_watch", "local_event_watch", "ai_cyber_watch"]
        legacy = {
            "schema_version": 3,
            "currency": "USD",
            "books": [
                {
                    "book_id": book_id,
                    "starting_balance": 2000.0,
                    "cash_balance": 1990.0,
                    "realized_pnl": -10.0,
                    "positions": [],
                }
                for book_id in legacy_ids
            ],
        }

        migrated = self.engine.migrate_ledger(legacy, self.now)
        migrated_again = self.engine.migrate_ledger(copy.deepcopy(migrated), self.now)

        self.assertEqual(migrated_again, migrated)
        self.assertEqual(migrated["schema_version"], 4)
        self.assertEqual(len(migrated["books"]), 24)
        self.assertEqual(len(migrated["archived_books"]), 5)
        self.assertEqual({book["book_id"] for book in migrated["archived_books"]}, set(legacy_ids))
        self.assertTrue(all(book["starting_balance"] == 2000.0 for book in migrated["books"]))
        self.assertTrue(all(book["cash_balance"] == 2000.0 for book in migrated["books"]))
        self.assertTrue(all(not book["initial_allocation_complete"] for book in migrated["books"]))
        self.assertTrue(all(book["additional_capital_contribution"] == 1000.0 for book in migrated["books"]))
        self.assertTrue(all(book["funding_migration_applied"] for book in migrated["books"]))

    def test_only_missing_or_empty_ledgers_and_exact_schema_three_ledgers_can_initialize_matrix(self):
        self.assertEqual(len(self.engine.migrate_ledger(None, self.now)["books"]), 24)
        self.assertEqual(len(self.engine.migrate_ledger({}, self.now)["books"]), 24)

        exact_legacy = {
            "schema_version": 3,
            "books": [{"book_id": book_id} for book_id in self.engine.LEGACY_BOOK_IDS],
        }
        invalid_ledgers = {
            "unknown schema": {"schema_version": 99, "books": []},
            "unversioned nonempty": {"books": []},
            "legacy missing": {**exact_legacy, "books": exact_legacy["books"][:-1]},
            "legacy duplicate": {
                **exact_legacy,
                "books": [*exact_legacy["books"][:-1], copy.deepcopy(exact_legacy["books"][0])],
            },
            "legacy renamed": {
                **exact_legacy,
                "books": [*exact_legacy["books"][:-1], {"book_id": "renamed-legacy-book"}],
            },
        }
        for label, raw in invalid_ledgers.items():
            with self.subTest(label=label), self.assertRaises(ValueError):
                self.engine.migrate_ledger(raw, self.now)

    def test_schema_four_requires_exact_unique_canonical_books_without_reseeding(self):
        canonical = self.engine.default_ledger(self.now)
        invalid_ledgers = {
            "missing": {**canonical, "books": canonical["books"][:-1]},
            "duplicate": {
                **canonical,
                "books": [*canonical["books"][:-1], copy.deepcopy(canonical["books"][0])],
            },
            "renamed": copy.deepcopy(canonical),
        }
        invalid_ledgers["renamed"]["books"][0]["book_id"] = "renamed-book"
        for label, raw in invalid_ledgers.items():
            with self.subTest(label=label), self.assertRaises(ValueError):
                self.engine.migrate_ledger(raw, self.now)

        crashed = copy.deepcopy(canonical)
        target = crashed["books"][0]
        target.update(
            {
                "cash_balance": 0.0,
                "equity": 0.0,
                "previous_equity": 0.0,
                "high_water_mark": 2000.0,
                "status": "crashed",
                "postmortem_required": True,
                "crashed_at": iso_z(self.now - timedelta(hours=1)),
                "crash_reason": "preserve-me",
            }
        )
        migrated = self.engine.migrate_ledger(crashed, self.now)
        preserved = next(book for book in migrated["books"] if book["book_id"] == target["book_id"])
        self.assertEqual(preserved["status"], "crashed")
        self.assertTrue(preserved["postmortem_required"])
        self.assertEqual(preserved["crashed_at"], target["crashed_at"])
        self.assertEqual(preserved["crash_reason"], "preserve-me")
        self.assertEqual(preserved["cash_balance"], 0.0)

    def test_partial_initial_allocation_only_buys_the_missing_seed_notional(self):
        ledger = self.engine.default_ledger(self.now)
        book = next(item for item in ledger["books"] if item["book_id"] == "standard__crypto")
        book.update(
            {
                "cash_balance": 1500.0,
                "equity": 2000.0,
                "initial_allocation_complete": False,
                "positions": [
                    {
                        "instrument_ref": "crypto:bitcoin",
                        "instrument_type": "crypto",
                        "symbol": "BTC",
                        "quantity": 5.0,
                        "entry_price": 100.0,
                        "mark_price": 100.0,
                        "previous_mark_price": 100.0,
                        "mark_status": "fresh",
                    }
                ],
            }
        )

        result = self.engine.process_tick(ledger, fresh_snapshot(self.now), now=self.now, run_idempotency_key="partial-seed")
        target = next(item for item in result["ledger"]["books"] if item["book_id"] == "standard__crypto")
        summary = self.engine.summarize_book(target)
        self.assertEqual(summary["gross_paper_exposure"], 1000.0)
        self.assertGreater(summary["transaction_costs"], 0.0)
        self.assertAlmostEqual(summary["cash_balance"], 1000.0 - summary["transaction_costs"], delta=0.03)

    def test_zero_equity_book_crashes_even_before_initial_allocation_completed(self):
        ledger = self.engine.default_ledger(self.now)
        book = next(item for item in ledger["books"] if item["book_id"] == "hyper_aggressive__crypto")
        book.update({"cash_balance": 0.0, "equity": 0.0, "positions": [], "initial_allocation_complete": False})

        result = self.engine.process_tick(ledger, fresh_snapshot(self.now), now=self.now, run_idempotency_key="preseed-crash")
        target = next(item for item in result["ledger"]["books"] if item["book_id"] == book["book_id"])
        summary = self.engine.summarize_book(target)
        self.assertEqual(summary["status"], "crashed")
        self.assertTrue(summary["postmortem_required"])

    def test_strategy_tags_cannot_spoof_an_ineligible_instrument_type(self):
        seeded = self.engine.process_tick(
            self.engine.default_ledger(self.now),
            fresh_snapshot(self.now),
            now=self.now,
            run_idempotency_key="type-seed",
        )["ledger"]
        second_now = self.now + timedelta(hours=1)
        snapshot = fresh_snapshot(second_now)
        snapshot["instruments"].append(
            {
                "instrument_ref": "equity:SPOOF",
                "instrument_type": "equity",
                "symbol": "SPOOF",
                "mark_price": 100.0,
                "previous_close": 1.0,
                "momentum_score": 99.0,
                "signal_score": 99.0,
                "retrieved_at": iso_z(second_now),
                "as_of": iso_z(second_now),
                "source_id": "spoof",
                "source_url": "https://example.test/spoof",
                "book_tags": ["crypto"],
            }
        )

        result = self.engine.process_tick(seeded, snapshot, now=second_now, run_idempotency_key="type-rebalance")
        book = next(item for item in result["ledger"]["books"] if item["book_id"] == "hyper_aggressive__crypto")
        self.assertTrue(book["positions"])
        self.assertTrue(all(position["instrument_type"] == "crypto" for position in book["positions"]))

    def test_schema_four_migration_rejects_negative_cash_instead_of_creating_capital(self):
        ledger = self.engine.default_ledger(self.now)
        ledger["books"][0]["cash_balance"] = -10.0
        with self.assertRaisesRegex(ValueError, "negative cash"):
            self.engine.migrate_ledger(ledger, self.now)

    def test_schema_four_strictly_validates_ledger_numbers_refs_and_price_ranges(self):
        base_position = {
            "position_id": "position-1",
            "instrument_ref": "crypto:bitcoin",
            "instrument_type": "crypto",
            "symbol": "BTC",
            "title": "Bitcoin",
            "quantity": 2.0,
            "entry_price": 100.0,
            "mark_price": 110.0,
            "previous_mark_price": 105.0,
            "cost_basis": 200.0,
            "market_value": 220.0,
            "mark_status": "fresh",
        }

        def ledger_with_position(position):
            ledger = self.engine.default_ledger(self.now)
            book = next(item for item in ledger["books"] if item["book_id"] == "standard__crypto")
            book.update({"cash_balance": 1780.0, "positions": [position], "initial_allocation_complete": True})
            return ledger

        invalid_mutations = [
            ("cash missing", lambda ledger: ledger["books"][0].pop("cash_balance")),
            ("cash NaN", lambda ledger: ledger["books"][0].update(cash_balance=float("nan"))),
            ("cash infinity", lambda ledger: ledger["books"][0].update(cash_balance=float("inf"))),
            ("empty instrument ref", lambda ledger: ledger["books"][1]["positions"][0].update(instrument_ref="  ")),
            ("negative quantity", lambda ledger: ledger["books"][1]["positions"][0].update(quantity=-1)),
            ("NaN quantity", lambda ledger: ledger["books"][1]["positions"][0].update(quantity=float("nan"))),
            ("negative entry price", lambda ledger: ledger["books"][1]["positions"][0].update(entry_price=-1)),
            ("infinite mark", lambda ledger: ledger["books"][1]["positions"][0].update(mark_price=float("inf"))),
        ]
        for label, mutate in invalid_mutations:
            raw = ledger_with_position(copy.deepcopy(base_position))
            mutate(raw)
            with self.subTest(label=label), self.assertRaises(ValueError):
                self.engine.migrate_ledger(raw, self.now)

        prediction = copy.deepcopy(base_position)
        prediction.update(
            instrument_ref="polymarket:market-1:YES",
            instrument_type="prediction_market",
            entry_price=1.01,
            mark_price=0.5,
        )
        ledger = self.engine.default_ledger(self.now)
        book = next(item for item in ledger["books"] if item["book_id"] == "standard__prediction_markets")
        book["positions"] = [prediction]
        with self.assertRaises(ValueError):
            self.engine.migrate_ledger(ledger, self.now)

    def test_migration_recomputes_market_value_instead_of_trusting_persisted_value(self):
        ledger = self.engine.default_ledger(self.now)
        book = next(item for item in ledger["books"] if item["book_id"] == "standard__crypto")
        book.update(
            {
                "cash_balance": 1780.0,
                "positions": [
                    {
                        "position_id": "position-1",
                        "instrument_ref": "crypto:bitcoin",
                        "instrument_type": "crypto",
                        "quantity": 2.0,
                        "entry_price": 100.0,
                        "mark_price": 110.0,
                        "previous_mark_price": 105.0,
                        "cost_basis": 999999.0,
                        "market_value": float("nan"),
                    }
                ],
            }
        )

        migrated = self.engine.migrate_ledger(ledger, self.now)
        target = next(item for item in migrated["books"] if item["book_id"] == book["book_id"])
        self.assertEqual(target["positions"][0]["cost_basis"], 200.0)
        self.assertEqual(target["positions"][0]["market_value"], 220.0)
        self.assertEqual(target["equity"], 2000.0)

    def test_instrument_validation_requires_provenance_timestamps_and_type_specific_prices(self):
        valid = instrument("crypto:bitcoin", "crypto", "BTC", 100.0, self.now, ["crypto"])
        invalid_mutations = [
            ("empty ref", {"instrument_ref": ""}),
            ("unknown type", {"instrument_type": "collectible"}),
            ("missing source", {"source_id": ""}),
            ("non-HTTPS source", {"source_url": "http://example.test/quote"}),
            ("future as_of", {"as_of": iso_z(self.now + timedelta(seconds=1))}),
            ("future retrieved", {"retrieved_at": iso_z(self.now + timedelta(seconds=1))}),
            ("unknown as_of", {"as_of": "not-a-timestamp"}),
            ("NaN", {"mark_price": float("nan")}),
            ("infinity", {"mark_price": float("inf")}),
            ("negative", {"mark_price": -1.0}),
            ("zero crypto", {"mark_price": 0.0, "settled": True}),
            ("crypto settlement spoof", {"settled": True}),
            ("non-boolean settlement", {"settled": "false"}),
        ]
        for label, changes in invalid_mutations:
            candidate = {**valid, **changes}
            with self.subTest(label=label):
                self.assertFalse(self.engine.instrument_fresh(candidate, self.now)[0])

        prediction = instrument(
            "polymarket:market-1:YES",
            "prediction_market",
            "YES",
            0.5,
            self.now,
            ["prediction_markets"],
            market_id="market-1",
            outcome="YES",
        )
        for mark in (-0.01, 1.01):
            with self.subTest(mark=mark):
                self.assertFalse(self.engine.instrument_fresh({**prediction, "mark_price": mark}, self.now)[0])
        for mark in (0.0, 1.0):
            with self.subTest(settlement_mark=mark):
                self.assertFalse(self.engine.instrument_fresh({**prediction, "mark_price": mark}, self.now)[0])
                self.assertTrue(self.engine.instrument_fresh({**prediction, "mark_price": mark, "settled": True}, self.now)[0])
        self.assertFalse(self.engine.instrument_fresh({**prediction, "mark_price": 0.5, "settled": True}, self.now)[0])

    def test_one_stale_open_mark_freezes_book_without_buys_or_defensive_liquidation(self):
        seeded = self.seed("stale-position-seed")["ledger"]
        book_before = next(item for item in seeded["books"] if item["book_id"] == "standard__crypto")
        positions_before = copy.deepcopy(book_before["positions"])
        stale_ref = positions_before[0]["instrument_ref"]
        later = self.now + timedelta(hours=1)
        snapshot = fresh_snapshot(later)
        snapshot["instruments"] = [item for item in snapshot["instruments"] if item["instrument_ref"] != stale_ref]
        for item in snapshot["instruments"]:
            if item["instrument_type"] == "crypto":
                item["momentum_score"] += 100.0

        result = self.engine.process_tick(
            seeded,
            snapshot,
            now=later,
            run_idempotency_key="stale-position-rebalance",
        )
        target = next(item for item in result["ledger"]["books"] if item["book_id"] == book_before["book_id"])
        target_fills = [
            event
            for event in result["events"]
            if event["book_id"] == target["book_id"] and event["event_type"] == "paper_fill"
        ]
        self.assertEqual(target_fills, [])
        self.assertEqual(target["cash_balance"], book_before["cash_balance"])
        self.assertEqual(
            [(position["instrument_ref"], position["quantity"]) for position in target["positions"]],
            [(position["instrument_ref"], position["quantity"]) for position in positions_before],
        )
        self.assertEqual(next(position for position in target["positions"] if position["instrument_ref"] == stale_ref)["mark_status"], "stale")

    def test_prediction_books_reach_each_line_exposure_target_with_one_binary_market(self):
        seeded = self.engine.process_tick(
            self.engine.default_ledger(self.now),
            fresh_snapshot(self.now),
            now=self.now,
            run_idempotency_key="prediction-seed",
        )["ledger"]
        second_now = self.now + timedelta(hours=1)
        result = self.engine.process_tick(
            seeded,
            fresh_snapshot(second_now),
            now=second_now,
            run_idempotency_key="prediction-rebalance",
        )
        expected = {
            "standard__prediction_markets": 0.80,
            "aggressive__prediction_markets": 0.95,
            "hyper_aggressive__prediction_markets": 1.0,
        }
        summaries = {
            item["book_id"]: self.engine.summarize_book(item)
            for item in result["ledger"]["books"]
        }
        for book_id, fraction in expected.items():
            summary = summaries[book_id]
            self.assertLessEqual(
                abs(summary["gross_paper_exposure"] - summary["equity"] * fraction),
                summary["transaction_costs"] + 0.1,
            )
            self.assertAlmostEqual(summary["cash_balance"], summary["equity"] - summary["gross_paper_exposure"], delta=0.05)


    def test_rejects_malformed_idempotency_state_and_run_keys(self):
        missing_keys = self.engine.default_ledger(self.now)
        del missing_keys["processed_idempotency_keys"]
        with self.assertRaisesRegex(ValueError, "missing processed_idempotency_keys"):
            self.engine.migrate_ledger(missing_keys, self.now)
        ledger = self.engine.default_ledger(self.now)
        ledger["processed_idempotency_keys"] = "tick-1"
        with self.assertRaisesRegex(ValueError, "processed_idempotency_keys"):
            self.engine.migrate_ledger(ledger, self.now)
        for key in ("", "bad key", float("nan")):
            with self.assertRaisesRegex(ValueError, "run_idempotency_key"):
                self.engine.process_tick(
                    self.engine.default_ledger(self.now),
                    fresh_snapshot(self.now),
                    now=self.now,
                    run_idempotency_key=key,
                )

    def test_cross_type_quote_cannot_refresh_held_crypto_position(self):
        seeded = self.seed("identity-seed")["ledger"]
        crypto_book = next(book for book in seeded["books"] if book["book_id"] == "standard__crypto")
        held = crypto_book["positions"][0]
        snapshot = fresh_snapshot(self.now + timedelta(hours=1))
        snapshot["instruments"] = [item for item in snapshot["instruments"] if item["instrument_ref"] != held["instrument_ref"]]
        spoof = instrument(
            held["instrument_ref"],
            "prediction_market",
            held["symbol"],
            0.5,
            self.now + timedelta(hours=1),
            ["prediction_markets"],
            market_id="spoof",
            outcome="YES",
        )
        snapshot["instruments"].append(spoof)
        result = self.engine.process_tick(
            seeded,
            snapshot,
            now=self.now + timedelta(hours=1),
            run_idempotency_key="identity-spoof",
        )
        actions = [decision for decision in result["decisions"] if decision["book_id"] == crypto_book["book_id"]]
        self.assertEqual([decision["action"] for decision in actions], ["AVOID"])
        self.assertEqual(actions[0]["status"], "stale_open_mark")

    def test_old_terminal_prediction_quote_settles_position_and_is_never_bought(self):
        seeded = self.seed("settlement-seed")["ledger"]
        prediction_book = next(book for book in seeded["books"] if book["book_id"] == "standard__prediction_markets")
        held = prediction_book["positions"][0]
        later = self.now + timedelta(days=1)
        snapshot = fresh_snapshot(later)
        snapshot["instruments"] = [item for item in snapshot["instruments"] if item["instrument_ref"] != held["instrument_ref"]]
        settled = instrument(
            held["instrument_ref"],
            "prediction_market",
            held["symbol"],
            0.0,
            later,
            ["prediction_markets"],
            market_id="market-1",
            outcome=held["symbol"],
        )
        settled["settled"] = True
        settled["as_of"] = iso_z(self.now)
        snapshot["instruments"].append(settled)
        result = self.engine.process_tick(
            seeded,
            snapshot,
            now=later,
            run_idempotency_key="terminal-settlement",
        )
        updated = next(book for book in result["ledger"]["books"] if book["book_id"] == prediction_book["book_id"])
        self.assertNotIn(held["instrument_ref"], {position["instrument_ref"] for position in updated["positions"]})
        settled_actions = [decision for decision in result["decisions"] if decision["book_id"] == prediction_book["book_id"] and decision["instrument_ref"] == held["instrument_ref"]]
        self.assertEqual([(decision["action"], decision["status"]) for decision in settled_actions], [("PAPER_SELL", "paper_settled")])
        self.assertFalse(any(decision["action"] == "PAPER_BUY" and decision["instrument_ref"] == held["instrument_ref"] for decision in result["decisions"]))

    def test_scalar_book_tags_never_match_by_substring(self):
        snapshot = fresh_snapshot(self.now)
        snapshot["instruments"].append(instrument("crypto:spoof", "crypto", "SPF", 10.0, self.now, "notcrypto", momentum=999.0))
        result = self.engine.process_tick(
            self.engine.default_ledger(self.now),
            snapshot,
            now=self.now,
            run_idempotency_key="scalar-tags",
        )
        self.assertFalse(any(decision["instrument_ref"] == "crypto:spoof" for decision in result["decisions"]))


if __name__ == "__main__":
    unittest.main()
