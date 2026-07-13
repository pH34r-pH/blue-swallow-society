import json
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from paper_engine_test import fresh_snapshot


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = REPO_ROOT / "scripts" / "mosaic-murmurs-paper-memory-loop.py"


class MosaicMurmursPaperMemoryLoopTest(unittest.TestCase):
    def test_tick_writes_snake_case_records_for_two_primary_loops_and_twenty_four_books(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            ledger_path = root / "ledger.json"
            state_dir = root / "state"
            morning_state = root / "missing-morning-state.json"
            market_snapshot = root / "market-snapshot.json"
            market_snapshot.write_text(
                json.dumps(fresh_snapshot(datetime.now(timezone.utc))),
                encoding="utf-8",
            )
            state_dir.mkdir(parents=True)
            (state_dir / "paper-ledger-events.jsonl").write_text(
                json.dumps(
                    {
                        "event_id": "legacy-pre-cost-fill",
                        "event_type": "paper_fill",
                        "book_id": "standard__crypto",
                        "generated_at": "2026-07-12T00:00:00Z",
                        "paper_only": True,
                    }
                ) + "\n",
                encoding="utf-8",
            )

            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT_PATH),
                    "--ledger",
                    str(ledger_path),
                    "--state-dir",
                    str(state_dir),
                    "--morning-state",
                    str(morning_state),
                    "--market-snapshot",
                    str(market_snapshot),
                    "--idempotency-key",
                    "integration-tick-1",
                    "--window-hours",
                    "1",
                    "--paper-sync-url",
                    "",
                ],
                cwd=REPO_ROOT,
                text=True,
                capture_output=True,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            packet = json.loads(result.stdout)
            self.assertEqual(packet["field_naming"]["canonical_case"], "snake_case")
            self.assertEqual(packet["loop_topology"]["primary_loops"], ["mosaic", "murmurs"])
            self.assertIn("bridge", packet["loop_topology"]["supporting_loops"])
            self.assertEqual(packet["paper_book_count"], 24)
            self.assertEqual({book["starting_balance"] for book in packet["paper_books"]}, {2000.0})
            self.assertTrue(all(990.0 < book["cash_balance"] < 1000.0 for book in packet["paper_books"]))
            self.assertEqual({book["gross_paper_exposure"] for book in packet["paper_books"]}, {1000.0})
            self.assertTrue(all(book["transaction_costs"] > 0 for book in packet["paper_books"]))
            self.assertEqual(packet["shadow_strategy_candidate_count"], 8)
            self.assertEqual(packet["shadow_strategy_policy_count"], 8)
            self.assertEqual(packet["matured_strategy_experience_count"], 0)

            latest_state = json.loads((state_dir / "latest_state.json").read_text(encoding="utf-8"))
            self.assertEqual({run["loop_role"] for run in latest_state["last_runs"]}, {"primary", "supporting"})
            self.assertEqual(
                [run["loop_id"] for run in latest_state["last_runs"] if run["loop_role"] == "primary"],
                ["mosaic", "murmurs"],
            )
            self.assertEqual(len(latest_state["paper_books"]), 24)
            self.assertEqual(latest_state["canonical_paper_state"]["schema_version"], "bss.paper_state.v3")
            self.assertEqual(len(latest_state["canonical_paper_state"]["ledger"]["books"]), 24)
            self.assertTrue(latest_state["canonical_paper_state"]["recent_paper_trades"])
            self.assertNotIn(
                "legacy-pre-cost-fill",
                {trade["event_id"] for trade in latest_state["canonical_paper_state"]["recent_paper_trades"]},
            )
            self.assertTrue(
                all(trade["cost_model_version"] == "bss.execution_costs.v1" for trade in latest_state["canonical_paper_state"]["recent_paper_trades"])
            )
            self.assertEqual(len(latest_state["shadow_strategy_candidates"]), 8)
            self.assertEqual(len(latest_state["shadow_strategy_policies"]), 8)
            self.assertTrue(all(candidate["promotion_state"] == "shadow" for candidate in latest_state["shadow_strategy_candidates"]))
            filled = [
                candidate
                for candidate in latest_state["last_paper_action_candidates"]
                if candidate["status"] == "paper_filled"
            ]
            self.assertAlmostEqual(sum(candidate["paper_size"] for candidate in filled), 24_000.0, places=2)
            self.assertTrue(all(candidate["autonomous_execution"] for candidate in filled))
            self.assertTrue(all(candidate["risk_policy_passed"] for candidate in filled))
            self.assertTrue(all(not candidate["human_review_required"] for candidate in filled))
            self.assertTrue(all(candidate["paper_only"] for candidate in latest_state["last_paper_action_candidates"]))
            self.assertTrue(any(event["event_type"] == "paper_fill" for event in latest_state["last_paper_ledger_events"]))
            self.assertTrue(all("run_id" in run and "started_at" in run for run in latest_state["last_runs"]))
            self.assertTrue(all("runId" not in run and "startedAt" not in run for run in latest_state["last_runs"]))

            record_lines_before = {
                name: Path(path).read_text(encoding="utf-8").splitlines()
                for name, path in latest_state["record_files"].items()
            }
            interrupted_name = "paper_ledger_events"
            interrupted_path = Path(latest_state["record_files"][interrupted_name])
            interrupted_path.write_text("\n".join(record_lines_before[interrupted_name][:-1]) + "\n", encoding="utf-8")
            replay_path = next((state_dir / "replay_states").glob("*.json"))
            interrupted_journal = json.loads(replay_path.read_text(encoding="utf-8"))
            interrupted_journal["committed"] = False
            replay_path.write_text(json.dumps(interrupted_journal), encoding="utf-8")
            (state_dir / "latest_state.json").unlink()
            replay = subprocess.run(
                result.args,
                cwd=REPO_ROOT,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(replay.returncode, 0, replay.stderr)
            replay_state = json.loads((state_dir / "latest_state.json").read_text(encoding="utf-8"))
            self.assertTrue(replay_state["engine_replayed"])
            self.assertEqual(replay_state["canonical_paper_state"], latest_state["canonical_paper_state"])
            self.assertEqual(replay_state["last_paper_action_candidates"], latest_state["last_paper_action_candidates"])
            self.assertEqual(replay_state["last_paper_ledger_events"], latest_state["last_paper_ledger_events"])
            for name, path in replay_state["record_files"].items():
                self.assertEqual(Path(path).read_text(encoding="utf-8").splitlines(), record_lines_before[name])

            replay_record_path = next((state_dir / "replay_states").glob("*.json"))
            replay_record = json.loads(replay_record_path.read_text(encoding="utf-8"))
            replay_record["canonical_paper_state"]["generated_at"] = "2026-07-13T01:00:01Z"
            replay_record_path.write_text(json.dumps(replay_record), encoding="utf-8")
            corrupt_replay = subprocess.run(
                result.args,
                cwd=REPO_ROOT,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertNotEqual(corrupt_replay.returncode, 0)
            self.assertIn("canonical state digest mismatch", corrupt_replay.stderr)


if __name__ == "__main__":
    unittest.main()
