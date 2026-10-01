"""Regression fixtures for the changed documentation/artifact guard."""

from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path

from check_documentation_artifacts import _git_paths, _path_errors, changed_living_docs


class DocumentationHygieneTests(unittest.TestCase):
    def test_descriptive_names_and_issue_number_only_rejection(self) -> None:
        self.assertEqual([], _path_errors("A", "docs/architecture.md"))
        self.assertEqual([], _path_errors("A", "docs/Current-Source-Map.md"))
        self.assertTrue(_path_errors("A", "docs/issue-123.md"))
        self.assertTrue(_path_errors("A", "docs/123.md"))

    def test_cache_and_temp_are_rejected_under_evidence(self) -> None:
        self.assertTrue(_path_errors("A", "evidence/cache/result.json"))
        self.assertTrue(_path_errors("A", "evidence/2026-10-01/scan.tmp"))
        self.assertEqual([], _path_errors("A", "evidence/2026-10-01/receipt.json"))

    def test_historical_scientific_and_generated_docs_are_not_living_docs(self) -> None:
        self.assertEqual([], changed_living_docs([("A", "specs/033-owner-upload-adapter/spec.md")]))
        self.assertEqual([], changed_living_docs([("A", "graphify-out/GRAPH_REPORT.md")]))
        self.assertEqual([], changed_living_docs([("A", "docs/crypto-paper-trading-strategy-research.md")]))

    def test_real_git_rename_checks_destination_and_preserves_spaced_paths(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)

            def git(*args: str) -> str:
                return subprocess.check_output(["git", *args], cwd=root, text=True).strip()

            git("init", "--quiet")
            git("config", "user.email", "docs@example.invalid")
            git("config", "user.name", "Documentation Test")
            (root / "docs").mkdir()
            (root / "docs" / "old guide.md").write_text("# Guide\n", encoding="utf-8")
            git("add", "docs/old guide.md")
            git("commit", "--quiet", "-m", "base")
            base = git("rev-parse", "HEAD")
            git("mv", "docs/old guide.md", "docs/issue-123.md")
            git("commit", "--quiet", "-m", "rename")

            paths = _git_paths(root, base)
            self.assertIn(("R", "docs/issue-123.md"), paths)
            self.assertTrue(_path_errors("R", "docs/issue-123.md"))


if __name__ == "__main__":
    unittest.main()
