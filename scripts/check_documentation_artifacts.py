#!/usr/bin/env python3
"""Check changed living docs and tracked temporary artifacts only.

Historical, scientific, and generated records remain outside the living-doc
style/link ratchet. The changed-file set is always derived from Git so a real
rename is checked at its destination and filenames are passed as arguments,
not interpolated into shell source.
"""

from __future__ import annotations

import argparse
import re
import subprocess
from pathlib import Path

RECORD_PREFIXES = (
    "graphify-out/",
    "specs/",
)
RECORD_DOC_NAMES = {
    "docs/blue-swallow-system-implementation-delta.md",
    "docs/crypto-paper-trading-strategy-research.md",
    "docs/wardriver-raid-backend-repair-plan.md",
}
RECORD_DOC_MARKERS = (
    "-research.md",
    "-proposal.md",
    "-proposals.md",
    "-paper-",
    "-dream-",
    "-operating-doctrine.md",
)
LIVING_NAME_EXCEPTIONS = {"README.md", "AGENTS.md"}
BAD_LIVING_STEMS = {"cache", "draft", "new", "notes", "scratch", "temp", "tmp", "untitled"}
DESCRIPTIVE_NAME = re.compile(r"^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$")
ISSUE_NUMBER_ONLY = re.compile(r"^(?:issue[-_]?)?\d+$", re.IGNORECASE)
SUSPICIOUS_PARTS = {
    ".cache",
    ".gradle",
    ".pytest_cache",
    "__pycache__",
    "build",
    "cache",
    "coverage",
    "dist",
    "node_modules",
    "temp",
    "tmp",
}
SUSPICIOUS_SUFFIXES = {".bak", ".log", ".orig", ".pyc", ".pyo", ".swp", ".swo", ".tmp"}


def _git_paths(root: Path, since: str) -> list[tuple[str, str]]:
    output = subprocess.check_output(
        [
            "git",
            "diff",
            "--name-status",
            "-z",
            "--find-renames",
            "--find-copies",
            "--diff-filter=ACMRT",
            f"{since}...HEAD",
        ],
        cwd=root,
    )
    fields = output.decode("utf-8", "surrogateescape").split("\0")
    records: list[tuple[str, str]] = []
    index = 0
    while index < len(fields) - 1 and fields[index]:
        status = fields[index]
        index += 1
        if status.startswith(("R", "C")):
            index += 1  # old path; the destination is the enforced path
            records.append((status[0], fields[index]))
        else:
            records.append((status[0], fields[index]))
        index += 1
    return records


def is_record(path: str | Path) -> bool:
    relative = Path(path).as_posix()
    name = Path(relative).name.lower()
    return (
        relative.startswith(RECORD_PREFIXES)
        or relative in RECORD_DOC_NAMES
        or any(name.endswith(marker) or marker in name for marker in RECORD_DOC_MARKERS)
    )


def is_living_doc(path: str | Path) -> bool:
    relative = Path(path).as_posix()
    if Path(relative).suffix.lower() not in {".md", ".markdown"} or is_record(relative):
        return False
    if relative in LIVING_NAME_EXCEPTIONS:
        return True
    if relative.startswith("docs/") or relative.startswith("app/") or relative.startswith("api/"):
        return True
    if relative.startswith("vm/") or relative.startswith(".github/"):
        return True
    return False


def _path_errors(status: str, relative: str) -> list[str]:
    path = Path(relative)
    errors: list[str] = []
    if "\n" in relative or "\t" in relative or path.is_absolute() or ".." in path.parts:
        return [f"{relative!r}: unsafe path returned by Git"]

    is_new_path = status in {"A", "C", "R"}
    if is_new_path and path.suffix.lower() in {".md", ".markdown"} and is_living_doc(relative):
        if path.name not in LIVING_NAME_EXCEPTIONS:
            stem = path.stem
            if stem.lower() in BAD_LIVING_STEMS or ISSUE_NUMBER_ONLY.fullmatch(stem):
                errors.append(f"{relative}: new living docs need a descriptive name")
            elif not DESCRIPTIVE_NAME.fullmatch(stem):
                errors.append(f"{relative}: new living docs need a descriptive filename")

    if path.name in {".DS_Store", "Thumbs.db"} or path.suffix.lower() in SUSPICIOUS_SUFFIXES:
        errors.append(f"{relative}: incidental temporary/build artifact is not approved")
    if any(part in SUSPICIOUS_PARTS for part in path.parts):
        errors.append(f"{relative}: incidental temporary/build artifact is not approved")
    return errors


def check_paths(paths: list[tuple[str, str]]) -> list[str]:
    errors: list[str] = []
    for status, relative in paths:
        errors.extend(_path_errors(status, relative))
    return errors


def changed_living_docs(paths: list[tuple[str, str]]) -> list[str]:
    return [path for _, path in paths if is_living_doc(path)]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--changed-since", required=True, help="Git revision used as the comparison base")
    parser.add_argument("--list-living-docs", action="store_true")
    parser.add_argument("--root", type=Path, help="Repository root; defaults to the checkout containing this script")
    args = parser.parse_args()
    root = args.root.resolve() if args.root else Path(__file__).resolve().parents[1]
    paths = _git_paths(root, args.changed_since)
    if args.list_living_docs:
        # stdout must be byte-empty when there are no selected docs so mapfile
        # and the workflow's -s/count checks cannot manufacture one empty path.
        living_docs = changed_living_docs(paths)
        if living_docs:
            print("\n".join(living_docs))
        return 0
    errors = check_paths(paths)
    if errors:
        print("Documentation/artifact guard failed:")
        print("\n".join(f"- {error}" for error in errors))
        return 1
    print(f"Documentation/artifact guard passed for {len(paths)} changed path(s).")
    print("Historical, scientific, and generated records remain outside the living-doc ratchet.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
