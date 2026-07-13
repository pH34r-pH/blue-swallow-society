import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "mosaic-murmurs-morning-brief-collect.py"


def load_morning_module():
    spec = importlib.util.spec_from_file_location("mosaic_murmurs_morning", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise AssertionError(f"Unable to load {SCRIPT_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class MorningBriefCollectorTests(unittest.TestCase):
    def test_default_paper_books_include_full_three_by_eight_matrix_awaiting_allocation(self):
        module = load_morning_module()
        books = module.summarize_books(module.DEFAULT_LEDGER_DATA, Path("missing.json"), False)

        self.assertEqual(len(books), 24)
        self.assertEqual({book["lineId"] for book in books}, {"standard", "aggressive", "hyper_aggressive"})
        self.assertEqual(len({book["strategyId"] for book in books}), 8)
        self.assertTrue(all(book["status"] == "awaiting_initial_allocation" for book in books))
        self.assertTrue(all(book["grossPaperExposure"] == 0 for book in books))
        self.assertTrue(all(book["cashBalance"] == 2000 for book in books))
        self.assertTrue(all(book["maxDrawdownPct"] == 0 for book in books))

    def test_open_position_without_mark_is_stale(self):
        module = load_morning_module()
        ledger = module.engine_default_ledger(module.utc_now())
        target = next(book for book in ledger["books"] if book["book_id"] == "standard__prediction_markets")
        target.update(
            {
                "cash_balance": 1000,
                "initial_allocation_complete": True,
                "positions": [
                    {
                        "instrument_ref": "example-market",
                        "instrument_type": "prediction_market",
                        "symbol": "YES",
                        "quantity": 100,
                        "entry_price": 0.42,
                        "mark_price": 0.42,
                        "mark_status": "stale",
                    }
                ],
            }
        )

        books = module.summarize_books(ledger, Path("ledger.json"), True)
        book = next(item for item in books if item["bookId"] == "standard__prediction_markets")

        self.assertEqual(book["status"], "stale")
        self.assertEqual(book["openPositionCount"], 1)
        self.assertEqual(book["grossPaperExposure"], 42.0)
        self.assertEqual(book["staleOpenMarks"], 1)

    def test_canonical_seeded_book_reports_cash_exposure_equity_and_zero_drawdown(self):
        module = load_morning_module()
        ledger = module.engine_default_ledger(module.utc_now())
        target = next(book for book in ledger["books"] if book["book_id"] == "standard__crypto")
        target.update(
            {
                "cash_balance": 1000,
                "initial_allocation_complete": True,
                "equity": 2000,
                "previous_equity": 2000,
                "high_water_mark": 2000,
                "positions": [
                    {
                        "instrument_ref": "crypto:bitcoin",
                        "instrument_type": "crypto",
                        "symbol": "BTC",
                        "quantity": 10,
                        "entry_price": 100,
                        "mark_price": 100,
                        "previous_mark_price": 100,
                        "mark_status": "fresh",
                    }
                ],
            }
        )

        books = module.summarize_books(ledger, Path("ledger.json"), True)
        book = next(item for item in books if item["bookId"] == "standard__crypto")

        self.assertEqual(book["bookId"], "standard__crypto")
        self.assertEqual(book["cashBalance"], 1000)
        self.assertEqual(book["grossPaperExposure"], 1000)
        self.assertEqual(book["equity"], 2000)
        self.assertEqual(book["maxDrawdownPct"], 0)
        self.assertEqual(book["status"], "flat")

    def test_rss_collection_normalizes_items(self):
        module = load_morning_module()
        sample = b"""<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0"><channel><title>Test Feed</title>
          <item>
            <title>Seattle cyber alert escalates</title>
            <link>https://example.test/story</link>
            <pubDate>Sat, 11 Jul 2026 12:00:00 GMT</pubDate>
            <description><![CDATA[<p>Official bulletin with <b>details</b>.</p>]]></description>
          </item>
        </channel></rss>"""
        source = {
            "id": "test-source",
            "name": "Test Source",
            "lane": "mosaic",
            "scope": "washington_state",
            "source_class": "official_local",
            "url": "https://example.test/feed.xml",
        }

        with patch.object(module, "fetch_bytes", return_value=sample):
            items, meta = module.collect_rss(source, timeout=1)

        self.assertEqual(meta["count"], 1)
        self.assertEqual(items[0]["title"], "Seattle cyber alert escalates")
        self.assertEqual(items[0]["url"], "https://example.test/story")
        self.assertEqual(items[0]["published_at"], "2026-07-11T12:00:00Z")
        self.assertEqual(items[0]["summary"], "Official bulletin with details .")
        self.assertEqual(items[0]["confidence"], "medium")

    def test_collector_writes_manifest_and_compact_packet_with_mocked_sources(self):
        module = load_morning_module()
        rss_item = {
            "id": "rss-1",
            "lane": "mosaic",
            "scope": "washington_state",
            "source_id": "rss",
            "source_name": "RSS",
            "source_class": "official_local",
            "title": "Seattle emergency update",
            "summary": "Official update.",
            "url": "https://example.test/rss",
            "published_at": "2026-07-11T12:00:00Z",
            "retrieved_at": None,
            "metrics": {},
            "confidence": "high",
        }
        hype_item = {
            "id": "hype-1",
            "lane": "murmurs",
            "scope": "operator_context",
            "source_id": "hn",
            "source_name": "HN",
            "source_class": "public_forum",
            "platforms": ["hacker_news"],
            "title": "New local LLM release spikes attention",
            "summary": "",
            "url": "https://example.test/hn",
            "published_at": "2026-07-11T13:00:00Z",
            "retrieved_at": None,
            "metrics": {"points": 100, "comments": 25},
            "confidence": "low",
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            ledger = Path(tmpdir) / "ledger.json"
            ledger.write_text('{"books": []}', encoding="utf-8")
            paper_state = Path(tmpdir) / "paper-state.json"
            paper_state.write_text(
                '{"last_paper_action_candidates":[{"action":"PAPER_BUY","book_id":"crypto","paper_size":100}]}' ,
                encoding="utf-8",
            )
            args = module.parse_args(
                [
                    "--output-dir",
                    str(Path(tmpdir) / "runs"),
                    "--state",
                    str(Path(tmpdir) / "state.json"),
                    "--ledger",
                    str(ledger),
                    "--paper-state",
                    str(paper_state),
                    "--news-limit",
                    "3",
                    "--hype-limit",
                    "3",
                ]
            )
            with patch.object(module, "RSS_SOURCES", [{"id": "rss", "name": "RSS"}]), patch.object(
                module, "JSON_SOURCES", [{"id": "hn", "name": "HN", "kind": "hn_algolia"}]
            ), patch.object(module, "collect_rss", return_value=([rss_item], {"count": 1})), patch.object(
                module, "collect_json_source", return_value=([hype_item], {"count": 1})
            ):
                manifest = module.build_manifest(args)

            packet = module.cron_packet(manifest)
            self.assertTrue(Path(manifest["manifest_path"]).exists())
            self.assertEqual(packet["breaking_reality"][0]["title"], "Seattle emergency update")
            self.assertEqual(packet["hype_weather"][0]["title"], "New local LLM release spikes attention")
            self.assertEqual(packet["paper_books"][0]["bookId"], "standard__prediction_markets")
            self.assertEqual(len(packet["paper_books"]), 24)
            self.assertEqual(packet["paper_action_candidates"][0]["action"], "PAPER_BUY")
            self.assertTrue(packet["governance"]["paper_only"])
            self.assertTrue(packet["governance"]["autonomous_paper_execution"])
            self.assertFalse(packet["governance"]["human_review_required_for_actions"])


if __name__ == "__main__":
    unittest.main()
