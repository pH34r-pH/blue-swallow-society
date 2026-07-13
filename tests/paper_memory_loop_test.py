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
    def test_tick_writes_snake_case_records_for_two_primary_loops_and_five_books(self):
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
            self.assertEqual(packet["paper_book_count"], 5)
            self.assertEqual({book["starting_balance"] for book in packet["paper_books"]}, {2000.0})
            self.assertEqual({book["cash_balance"] for book in packet["paper_books"]}, {1000.0})
            self.assertEqual({book["gross_paper_exposure"] for book in packet["paper_books"]}, {1000.0})

            latest_state = json.loads((state_dir / "latest_state.json").read_text(encoding="utf-8"))
            self.assertEqual({run["loop_role"] for run in latest_state["last_runs"]}, {"primary", "supporting"})
            self.assertEqual(
                [run["loop_id"] for run in latest_state["last_runs"] if run["loop_role"] == "primary"],
                ["mosaic", "murmurs"],
            )
            self.assertEqual(len(latest_state["paper_books"]), 5)
            filled = [
                candidate
                for candidate in latest_state["last_paper_action_candidates"]
                if candidate["status"] == "paper_filled"
            ]
            self.assertAlmostEqual(sum(candidate["paper_size"] for candidate in filled), 5000.0, places=2)
            self.assertTrue(all(candidate["autonomous_execution"] for candidate in filled))
            self.assertTrue(all(candidate["risk_policy_passed"] for candidate in filled))
            self.assertTrue(all(not candidate["human_review_required"] for candidate in filled))
            self.assertTrue(all(candidate["paper_only"] for candidate in latest_state["last_paper_action_candidates"]))
            self.assertTrue(any(event["event_type"] == "paper_fill" for event in latest_state["last_paper_ledger_events"]))
            self.assertTrue(all("run_id" in run and "started_at" in run for run in latest_state["last_runs"]))
            self.assertTrue(all("runId" not in run and "startedAt" not in run for run in latest_state["last_runs"]))

            candidate_log = state_dir / "paper_action_candidates.jsonl"
            event_log = state_dir / "paper_ledger_events.jsonl"
            candidate_lines_before = candidate_log.read_text(encoding="utf-8").splitlines()
            event_lines_before = event_log.read_text(encoding="utf-8").splitlines()
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
            self.assertEqual(replay_state["last_paper_action_candidates"], latest_state["last_paper_action_candidates"])
            self.assertEqual(replay_state["last_paper_ledger_events"], latest_state["last_paper_ledger_events"])
            self.assertEqual(candidate_log.read_text(encoding="utf-8").splitlines(), candidate_lines_before)
            self.assertEqual(event_log.read_text(encoding="utf-8").splitlines(), event_lines_before)


if __name__ == "__main__":
    unittest.main()
