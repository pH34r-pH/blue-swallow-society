import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = REPO_ROOT / "scripts" / "mosaic-murmurs-paper-memory-loop.py"


class MosaicMurmursPaperMemoryLoopTest(unittest.TestCase):
    def test_tick_writes_snake_case_records_for_two_primary_loops_and_five_books(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            ledger_path = root / "ledger.json"
            state_dir = root / "state"
            morning_state = root / "missing-morning-state.json"

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
                    "--window-hours",
                    "1",
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
            self.assertEqual({book["starting_balance"] for book in packet["paper_books"]}, {1000.0})

            latest_state = json.loads((state_dir / "latest_state.json").read_text(encoding="utf-8"))
            self.assertEqual({run["loop_role"] for run in latest_state["last_runs"]}, {"primary", "supporting"})
            self.assertEqual(
                [run["loop_id"] for run in latest_state["last_runs"] if run["loop_role"] == "primary"],
                ["mosaic", "murmurs"],
            )
            self.assertEqual(len(latest_state["paper_books"]), 5)
            self.assertTrue(all(candidate["review_required"] for candidate in latest_state["last_paper_action_candidates"]))
            self.assertTrue(all(candidate["paper_only"] for candidate in latest_state["last_paper_action_candidates"]))
            self.assertTrue(all("run_id" in run and "started_at" in run for run in latest_state["last_runs"]))
            self.assertTrue(all("runId" not in run and "startedAt" not in run for run in latest_state["last_runs"]))


if __name__ == "__main__":
    unittest.main()
