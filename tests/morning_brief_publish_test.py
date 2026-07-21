import hashlib
import importlib.util
import json
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
RENDERER_PATH = REPO_ROOT / "scripts" / "mosaic-murmurs-morning-brief-render.py"
PUBLISHER_PATH = REPO_ROOT / "scripts" / "mosaic-murmurs-morning-brief-publish.py"


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise AssertionError(f"Unable to load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def manifest(now: datetime) -> dict:
    return {
        "schema_version": 1,
        "run_id": "morning-brief-2026-07-21",
        "generated_at": iso(now),
        "source_counts": {"official": 1, "forum": 1},
        "source_errors": [],
        "brief_inputs": {
            "breaking_reality": [{"title": "Verified field fact", "summary": "Public evidence is present.", "source": "Official", "url": "https://example.test/fact", "confidence": "high"}],
            "hype_weather": [{"title": "Attention spike", "summary": "Perception has moved before verification.", "source": "Forum", "url": "https://example.test/hype", "confidence": "low"}],
            "market_signals": [{"title": "Belief delta", "summary": "Market belief remains separate from fact.", "source": "Market", "url": "https://example.test/market", "confidence": "medium"}],
            "paper_action_candidates": [{"action": "WATCH", "book_id": "standard__crypto", "instrument_ref": "crypto:bitcoin", "paper_size": 0, "thesis": "Watch only.", "risk_policy_passed": True}],
            "paper_books": [{"displayName": "Standard / Crypto", "openPositionCount": 0, "grossPaperExposure": 0, "dailyPnl": 0, "cumulativePnl": 0, "drawdownPct": 0, "status": "flat"}],
        },
        "governance": {"paper_only": True, "autonomous_paper_execution": True, "no_real_money_execution": True},
    }


class MorningBriefPublisherTests(unittest.TestCase):
    def render(self, tmpdir: Path, now: datetime):
        renderer = load_module(RENDERER_PATH, "field_dossier_for_publisher_test")
        state = {"generated_at": iso(now), "ledger": {"books": []}}
        receipt = {"ok": True, "updated_at": iso(now), "canonical_paper_state": state}
        return renderer.render_field_dossier(
            manifest(now),
            "Operator summary from /home/ph3/private/brief must not leak.",
            receipt,
            tmpdir,
            now=now,
        )

    def test_archive_envelope_hash_binds_the_full_field_dossier_artifact_set(self):
        publisher = load_module(PUBLISHER_PATH, "morning_brief_publisher")
        now = datetime(2026, 7, 21, 13, 0, tzinfo=timezone.utc)
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)
            rendered = self.render(output, now)
            envelope = publisher.build_archive_envelope(rendered, output)

            self.assertEqual(envelope["schema_version"], "bss.morning_brief.package.v1")
            self.assertEqual(envelope["run_id"], rendered["run_id"])
            self.assertEqual(envelope["canonical_state_hash"], rendered["canonical_state_hash"])
            self.assertGreaterEqual(len(envelope["artifacts"]), len(rendered["pages"]) + 4)
            self.assertEqual([item["artifact_id"] for item in envelope["artifacts"][:len(rendered["pages"])]], [f"page-{item['page']:02d}" for item in rendered["pages"]])
            self.assertTrue(all("content_base64" in item and item["sha256"] for item in envelope["artifacts"]))
            self.assertNotIn("/home/ph3/private/brief", envelope["summary"])

            bound = {
                "schema_version": envelope["schema_version"],
                "run_id": envelope["run_id"],
                "generated_at": envelope["generated_at"],
                "canonical_state_hash": envelope["canonical_state_hash"],
                "summary": envelope["summary"],
                "artifacts": [
                    {key: artifact[key] for key in ("artifact_id", "media_type", "sha256")}
                    for artifact in envelope["artifacts"]
                ],
            }
            expected = hashlib.sha256(json.dumps(bound, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
            self.assertEqual(envelope["package_sha256"], expected)

    def test_archive_readback_rejects_hash_or_metadata_drift_before_dispatch(self):
        publisher = load_module(PUBLISHER_PATH, "morning_brief_publisher_readback")
        now = datetime(2026, 7, 21, 13, 0, tzinfo=timezone.utc)
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)
            envelope = publisher.build_archive_envelope(self.render(output, now), output)
            artifact_payloads = {
                artifact["artifact_id"]: publisher.base64.b64decode(artifact["content_base64"])
                for artifact in envelope["artifacts"]
            }
            matching_brief = {
                "run_id": envelope["run_id"],
                "package_sha256": envelope["package_sha256"],
                "canonical_state_hash": envelope["canonical_state_hash"],
                "artifacts": [
                    {key: artifact[key] for key in ("artifact_id", "media_type", "sha256")}
                    for artifact in envelope["artifacts"]
                ],
            }
            publisher.verify_archived_package(envelope, matching_brief, artifact_payloads)

            bad = dict(matching_brief)
            bad["package_sha256"] = "0" * 64
            with self.assertRaisesRegex(RuntimeError, "package hash"):
                publisher.verify_archived_package(envelope, bad, artifact_payloads)

            missing = dict(artifact_payloads)
            missing.pop(next(iter(missing)))
            with self.assertRaisesRegex(RuntimeError, "artifact"):
                publisher.verify_archived_package(envelope, matching_brief, missing)

    def test_dispatch_receipts_bind_to_the_archived_envelope_hash(self):
        publisher = load_module(PUBLISHER_PATH, "morning_brief_publisher_archive_dispatch")
        now = datetime(2026, 7, 21, 13, 0, tzinfo=timezone.utc)
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "package"
            rendered = self.render(output, now)
            envelope = publisher.build_archive_envelope(rendered, output)
            package = publisher.dispatchable_package(rendered, envelope)
            sent = []
            result = publisher.dispatch_packet(
                package,
                output,
                Path(tmp) / "receipts",
                "discord:1506403622789976145",
                sender=lambda target, message: sent.append((target, message)) or {"ok": True},
                now=now,
            )
            self.assertEqual(package["package_sha256"], envelope["package_sha256"])
            self.assertTrue(result["delivered_batches"])
            receipt = next((Path(tmp) / "receipts").rglob("*.json"))
            self.assertEqual(json.loads(receipt.read_text(encoding="utf-8"))["package_sha256"], envelope["package_sha256"])

    def test_vm_installer_does_not_activate_a_second_morning_brief_publisher(self):
        installer = (REPO_ROOT / "infra" / "scripts" / "install-cybermap-api.sh").read_text(encoding="utf-8")
        main_bicep = (REPO_ROOT / "infra" / "main.bicep").read_text(encoding="utf-8")
        vm_bicep = (REPO_ROOT / "infra" / "vm-echo-lab.bicep").read_text(encoding="utf-8")
        workflow = (REPO_ROOT / ".github" / "workflows" / "deploy-static-web-app.yml").read_text(encoding="utf-8")
        for source in (installer, main_bicep, vm_bicep, workflow):
            self.assertNotIn("BSS_DISCORD_MORNING_BRIEF_WEBHOOK_URL", source)
        self.assertNotIn("bss-morning-brief.timer", installer)
        self.assertNotIn("bss-morning-brief.service", installer)

    def test_stale_wake_withholds_before_any_backend_request(self):
        publisher = load_module(PUBLISHER_PATH, "morning_brief_publisher_stale")
        now = datetime.now(timezone.utc).replace(microsecond=0)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            run_manifest = manifest(now - timedelta(hours=3, seconds=1))
            manifest_path = root / "run.json"
            delivery_path = root / "run.md"
            wake_path = root / "wake.json"
            manifest_path.write_text(json.dumps(run_manifest), encoding="utf-8")
            delivery_path.write_text("This stale packet must not dispatch.", encoding="utf-8")
            wake_path.write_text(json.dumps({
                "ok": True,
                "updated_at": iso(now - timedelta(hours=3, seconds=1)),
                "canonical_paper_state": {"generated_at": iso(now - timedelta(hours=3, seconds=1))},
            }), encoding="utf-8")
            args = SimpleNamespace(
                manifest=manifest_path,
                delivery=delivery_path,
                wake_receipt=wake_path,
                runtime_dir=root,
                backend_url="https://archive.example.test",
                archive_token="a" * 32,
                paper_token="p" * 32,
                receipt_dir=root / "receipts",
                discord_target="discord:1506403622789976145",
                no_dispatch=True,
            )
            with patch.object(publisher, "fetch_canonical_paper_state", side_effect=AssertionError("backend must not be contacted")):
                result = publisher.publish(args)
            self.assertEqual(result, {"status": "withheld", "reasons": ["manifest_stale", "canonical_state_stale"]})

    def test_dispatch_is_batched_at_ten_and_receipt_idempotent_by_run_and_package_hash(self):
        publisher = load_module(PUBLISHER_PATH, "morning_brief_publisher_dispatch")
        now = datetime(2026, 7, 21, 13, 0, tzinfo=timezone.utc)
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "package"
            output.mkdir()
            pages = []
            for page in range(1, 12):
                name = f"{page:02d}-page.png"
                (output / name).write_bytes(f"page-{page}".encode("ascii"))
                pages.append({"page": page, "png": name, "png_sha256": hashlib.sha256(f"page-{page}".encode("ascii")).hexdigest()})
            package = {"status": "validated", "run_id": "morning-brief-2026-07-21", "package_sha256": "a" * 64, "pages": pages}
            sent = []

            def sender(target, message):
                sent.append((target, message))
                return {"ok": True, "message_id": f"m{len(sent)}"}

            receipt_root = Path(tmp) / "receipts"
            first = publisher.dispatch_packet(package, output, receipt_root, "discord:1506403622789976145", sender=sender, now=now)
            self.assertEqual(first["delivered_batches"], [1, 2])
            self.assertEqual(len(sent), 2)
            self.assertTrue(all(message.count("MEDIA:") <= 10 for _, message in sent))
            self.assertTrue(all("BATCH" in message for _, message in sent))

            second = publisher.dispatch_packet(package, output, receipt_root, "discord:1506403622789976145", sender=sender, now=now + timedelta(minutes=1))
            self.assertEqual(second["delivered_batches"], [1, 2])
            self.assertEqual(len(sent), 2)
            self.assertTrue(list(receipt_root.rglob("*.json")))


if __name__ == "__main__":
    unittest.main()
