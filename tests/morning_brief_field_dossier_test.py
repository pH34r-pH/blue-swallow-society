import hashlib
import importlib.util
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "mosaic-murmurs-morning-brief-render.py"
MARKET_PATH = Path(__file__).resolve().parents[1] / "scripts" / "mosaic_murmurs_market_data.py"


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise AssertionError(f"Unable to load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sample_manifest(now: datetime) -> dict:
    return {
        "schema_version": 1,
        "run_id": "morning-brief-2026-07-21",
        "generated_at": iso(now),
        "generated_at_local": iso(now),
        "window": {"start": iso(now - timedelta(hours=24)), "end": iso(now)},
        "source_counts": {"official": 1, "forum": 1},
        "source_errors": [{"source_id": "offline-source", "message": "timeout"}],
        "brief_inputs": {
            "breaking_reality": [{"title": "Verified field fact", "summary": "Public evidence is present.", "source": "Official", "url": "https://example.test/fact", "confidence": "high", "scope": "washington_state"}],
            "hype_weather": [{"title": "Attention spike", "summary": "Perception has moved before verification.", "source": "Forum", "url": "https://example.test/hype", "confidence": "low", "platforms": ["forum"]}],
            "market_signals": [{"title": "Belief delta", "summary": "Market belief remains separate from fact.", "source": "Market", "url": "https://example.test/market", "confidence": "medium"}],
            "paper_action_candidates": [{"action": "WATCH", "book_id": "standard__crypto", "instrument_ref": "crypto:bitcoin", "paper_size": 0, "thesis": "Watch only.", "risk_policy_passed": True}],
            "paper_books": [{"displayName": "Standard / Crypto", "openPositionCount": 0, "grossPaperExposure": 0, "dailyPnl": 0, "cumulativePnl": 0, "drawdownPct": 0, "status": "flat"}],
        },
        "governance": {"paper_only": True, "autonomous_paper_execution": True, "no_real_money_execution": True},
    }


class MorningBriefFieldDossierTests(unittest.TestCase):
    def test_prediction_adapter_rejects_out_of_range_outcome_prices_before_emitting_instruments(self):
        market = load_module(MARKET_PATH, "market_data")
        now = datetime(2026, 7, 21, tzinfo=timezone.utc)
        instruments = market.parse_polymarket_markets([
            {"id": "bad", "outcomes": "[\"Yes\",\"No\"]", "outcomePrices": "[\"0.5\",\"1.2\"]", "updatedAt": iso(now)},
        ], now)
        self.assertEqual(instruments, [])

    def test_stale_or_unsuccessful_wake_withholds_the_run_without_dispatch(self):
        renderer = load_module(SCRIPT_PATH, "field_dossier")
        now = datetime(2026, 7, 21, 13, 0, tzinfo=timezone.utc)
        manifest = sample_manifest(now)
        receipt = {"ok": True, "updated_at": iso(now - timedelta(hours=3, seconds=1)), "canonical_paper_state": {"generated_at": iso(now - timedelta(hours=3, seconds=1))}}
        verdict = renderer.validate_run(manifest, receipt, now=now)
        self.assertEqual(verdict["status"], "withheld")
        self.assertEqual(verdict["reasons"], ["canonical_state_stale"])
        self.assertEqual(renderer.plan_discord_dispatch({"status": "withheld"}, []), [])

    def test_rendered_package_covers_lanes_has_ordered_1200x1500_pngs_and_hash_bound_batches(self):
        renderer = load_module(SCRIPT_PATH, "field_dossier")
        now = datetime(2026, 7, 21, 13, 0, tzinfo=timezone.utc)
        manifest = sample_manifest(now)
        canonical = {"generated_at": iso(now), "ledger": {"books": []}}
        receipt = {"ok": True, "updated_at": iso(now), "canonical_paper_state": canonical}
        with tempfile.TemporaryDirectory() as tmpdir:
            result = renderer.render_field_dossier(manifest, "Operator summary from /home/ph3/private/path must not leak.", receipt, Path(tmpdir), now=now)
            self.assertEqual(result["status"], "validated")
            self.assertEqual(result["coverage"]["missing"], [])
            self.assertTrue(result["package_sha256"])
            self.assertGreaterEqual(len(result["pages"]), 8)
            self.assertEqual([page["page"] for page in result["pages"]], list(range(1, len(result["pages"]) + 1)))
            for page in result["pages"]:
                self.assertEqual(page["png_dimensions"], [1200, 1500])
                self.assertTrue((Path(tmpdir) / page["png"]).exists())
            package_text = (Path(tmpdir) / "package.json").read_text(encoding="utf-8")
            self.assertNotIn("/home/ph3/private/path", package_text)
            batches = renderer.plan_discord_dispatch(result, result["pages"])
            self.assertTrue(batches)
            self.assertTrue(all(0 < len(batch["artifacts"]) <= 10 for batch in batches))
            self.assertTrue(all(batch["package_sha256"] == result["package_sha256"] for batch in batches))
            payload = json.loads((Path(tmpdir) / "package.json").read_text(encoding="utf-8"))
            self.assertEqual(payload["package_sha256"], result["package_sha256"])


if __name__ == "__main__":
    unittest.main()
