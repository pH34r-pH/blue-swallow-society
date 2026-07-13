import importlib.util
import json
import os
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from paper_engine_test import fresh_snapshot, load_engine


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

    def read(self, _limit) -> bytes:
        return b'{"ok":true,"source":"mosaic-murmurs-paper-engine","idempotency_key":"tick-1","generated_at":"2026-07-13T01:00:00Z"}'

    @property
    def headers(self):
        return {"Idempotent-Replayed": "false"}


class PaperSyncTests(unittest.TestCase):
    def test_builds_canonical_paper_only_envelope_and_syncs_with_dedicated_token(self):
        module = load_module()
        now = datetime(2026, 7, 13, 1, 0, tzinfo=timezone.utc)
        engine = load_engine()
        tick = engine.process_tick(
            engine.default_ledger(now),
            fresh_snapshot(now),
            now=now,
            run_idempotency_key="tick-1",
        )
        ledger = tick["ledger"]
        books = ledger["books"]
        ledger["archived_books"] = [{"book_id": "legacy", "archived_at": "2026-07-13T00:00:00Z", "archive_reason": "migration", "private_note": "must-not-sync"}]
        summaries = [engine.summarize_book(book) for book in books]
        actions = tick["decisions"]
        events = tick["events"]
        recent_trades = [event for event in events if event["event_type"] == "paper_fill"][-64:]
        envelope = module.build_paper_state(ledger, summaries, actions, events, now, recent_trades=recent_trades)
        captured = {}

        def opener(request, timeout):
            captured["request"] = request
            captured["timeout"] = timeout
            return FakeResponse()

        result = module.sync_paper_state(
            "https://backend.test:8080/api/v1/paper/state",
            "dedicated-paper-state-token-32-bytes-minimum",
            "tick-1",
            envelope,
            opener=opener,
        )

        self.assertEqual(envelope["schema_version"], "bss.paper_state.v2")
        self.assertTrue(envelope["autonomous_execution"])
        self.assertNotIn("private_note", envelope["ledger"]["archived_books"][0])
        self.assertEqual(envelope["ledger"]["books"], ledger["books"])
        self.assertEqual(envelope["recent_paper_trades"], recent_trades)
        self.assertTrue(envelope["governance"]["crash_requires_postmortem"])
        self.assertEqual(json.loads(captured["request"].data), envelope)
        self.assertEqual(captured["request"].get_method(), "PUT")
        self.assertEqual(captured["request"].get_header("Idempotency-key"), "tick-1")
        self.assertEqual(
            captured["request"].get_header("X-blue-swallow-paper-state-token"),
            "dedicated-paper-state-token-32-bytes-minimum",
        )
        self.assertEqual(result["status"], 201)
        self.assertFalse(result["replayed"])

        with self.assertRaisesRegex(module.PaperSyncError, "HTTPS"):
            module.sync_paper_state(
                "http://backend.test:8080/api/v1/paper/state",
                "dedicated-paper-state-token-32-bytes-minimum",
                "tick-2",
                envelope,
                opener=opener,
            )

        class MalformedResponse(FakeResponse):
            def read(self, _limit) -> bytes:
                return b"not-json"

        with self.assertRaisesRegex(module.PaperSyncError, "invalid response"):
            module.sync_paper_state(
                "https://backend.test:8080/api/v1/paper/state",
                "dedicated-paper-state-token-32-bytes-minimum",
                "tick-3",
                envelope,
                opener=lambda *_args, **_kwargs: MalformedResponse(),
            )

        too_many = [
            {**recent_trades[0], "event_id": f"fill-{index}"}
            for index in range(65)
        ]
        with self.assertRaisesRegex(ValueError, "capped at 64"):
            module.build_paper_state(ledger, summaries, actions, [], now, recent_trades=too_many)

    def test_token_file_must_be_owner_only_regular_file(self):
        module = load_module()
        with tempfile.TemporaryDirectory() as directory:
            token_path = Path(directory) / "token"
            token_path.write_text("x" * 40, encoding="utf-8")
            os.chmod(token_path, 0o644)
            with self.assertRaisesRegex(module.PaperSyncError, "mode 0600"):
                module.read_token_file(token_path)
            os.chmod(token_path, 0o600)
            self.assertEqual(module.read_token_file(token_path), "x" * 40)


if __name__ == "__main__":
    unittest.main()
