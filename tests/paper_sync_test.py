import importlib.util
import json
import unittest
from datetime import datetime, timezone
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "mosaic_murmurs_paper_sync.py"


def load_module():
    spec = importlib.util.spec_from_file_location("mosaic_murmurs_paper_sync", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeResponse:
    status = 201

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, _limit):
        return b'{"ok":true,"source":"mosaic-murmurs-paper-engine"}'

    @property
    def headers(self):
        return {"Idempotent-Replayed": "false"}


class PaperSyncTests(unittest.TestCase):
    def test_builds_canonical_paper_only_envelope_and_syncs_with_dedicated_token(self):
        module = load_module()
        now = datetime(2026, 7, 13, 1, 0, tzinfo=timezone.utc)
        ledger = {
            "schema_version": 3,
            "paper_only": True,
            "books": [
                {"book_id": book_id, "starting_balance": 2000, "cash_balance": 1000, "positions": []}
                for book_id in ["prediction_markets", "crypto", "equity_watch", "local_event_watch", "ai_cyber_watch"]
            ],
        }
        actions = [{"action": "PAPER_BUY", "paper_only": True}]
        envelope = module.build_paper_state(ledger, [], actions, [], now)
        captured = {}

        def opener(request, timeout):
            captured["request"] = request
            captured["timeout"] = timeout
            return FakeResponse()

        result = module.sync_paper_state(
            "http://backend.test:8080/api/v1/paper/state",
            "dedicated-paper-state-token-32-bytes-minimum",
            "tick-1",
            envelope,
            opener=opener,
        )

        self.assertEqual(envelope["schema_version"], "bss.paper_state.v1")
        self.assertTrue(envelope["autonomous_execution"])
        self.assertEqual(envelope["ledger"], ledger)
        self.assertEqual(json.loads(captured["request"].data), envelope)
        self.assertEqual(captured["request"].get_method(), "PUT")
        self.assertEqual(captured["request"].get_header("Idempotency-key"), "tick-1")
        self.assertEqual(
            captured["request"].get_header("X-blue-swallow-paper-state-token"),
            "dedicated-paper-state-token-32-bytes-minimum",
        )
        self.assertEqual(result["status"], 201)
        self.assertFalse(result["replayed"])


if __name__ == "__main__":
    unittest.main()
