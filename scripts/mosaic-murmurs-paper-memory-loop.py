#!/usr/bin/env python3
"""Run autonomous Mosaic & Murmurs paper-memory loop ticks.

The local scheduler owns deterministic paper-only decisions, risk checks, fills,
marks, and append-only audit records. It has no real-money execution adapter.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from mosaic_murmurs_market_data import collect_market_snapshot as collect_live_market_snapshot
from mosaic_murmurs_paper_sync import PaperSyncError, build_paper_state, read_token_file, sync_paper_state
from mosaic_murmurs_paper_engine import (
    BOOK_SPECS as ENGINE_BOOK_SPECS,
    default_ledger as engine_default_ledger,
    migrate_ledger as engine_migrate_ledger,
    process_tick as process_paper_tick,
    summarize_book as engine_summarize_book,
)

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
DEFAULT_STATE_DIR = Path.home() / ".hermes" / "mosaic-murmurs" / "paper-memory-loop"
DEFAULT_PAPER_SYNC_URL_FILE = Path.home() / ".config" / "blue-swallow" / "paper-state-url"
DEFAULT_LEDGER = DEFAULT_STATE_DIR / "paper-ledger.json"
DEFAULT_LEDGER_SEED = REPO_ROOT / "config" / "mosaic-murmurs-paper-ledger.json"
DEFAULT_MORNING_STATE = Path.home() / ".hermes" / "mosaic-murmurs" / "morning-brief" / "state.json"
BOOK_STARTING_BALANCE = 2_000.0

PRIMARY_LOOPS: dict[str, dict[str, str]] = {
    "mosaic": {
        "display_name": "Mosaic",
        "loop_role": "primary",
        "duty": "evidence-bound truth accounting, claim state, calibration, and fact-memory patches",
    },
    "murmurs": {
        "display_name": "Murmurs",
        "loop_role": "primary",
        "duty": "public-perception accounting, virality, narrative motion, and perception-memory patches",
    },
}

SUPPORTING_LOOPS: dict[str, dict[str, str]] = {
    "bridge": {
        "display_name": "Bridge",
        "loop_role": "supporting",
        "duty": "compare Mosaic truth, Murmurs belief, and market-implied belief for perceptual deltas",
    },
    "paper": {
        "display_name": "Paper Ledger",
        "loop_role": "supporting",
        "duty": "mark paper books, append paper ledger events, and preserve paper-only balances",
    },
    "narrative": {
        "display_name": "Narrative Stream",
        "loop_role": "supporting",
        "duty": "materialize bounded operator-only stream fragments from loop outputs",
    },
    "memory_sync": {
        "display_name": "Memory Sync",
        "loop_role": "supporting",
        "duty": "queue evidence-backed memory patches for review",
    },
    "source_health": {
        "display_name": "Source Health",
        "loop_role": "supporting",
        "duty": "record retrieval degradation, staleness, and sync-delay events",
    },
}

LOOP_ORDER = ["mosaic", "murmurs", "bridge", "paper", "narrative", "memory_sync", "source_health"]
LOOP_TOPOLOGY = {
    "primary_loops": list(PRIMARY_LOOPS),
    "supporting_loops": list(SUPPORTING_LOOPS),
    "rule": "Mosaic and Murmurs are the two primary owned loops; Bridge, paper, narrative, memory_sync, and source_health are supporting loops.",
}
FIELD_NAMING = {
    "canonical_case": "snake_case",
    "scope": "local append-only records and VM API payloads",
    "ui_boundary": "SWA JavaScript may adapt to camelCase internally, but persisted loop records stay snake_case.",
}

BOOK_SPECS: list[dict[str, Any]] = ENGINE_BOOK_SPECS

RECORD_FILES = {
    "agent_loop_runs": "agent_loop_runs.jsonl",
    "narrative_fragments": "narrative_fragments.jsonl",
    "paper_action_candidates": "paper_action_candidates.jsonl",
    "paper_ledger_events": "paper_ledger_events.jsonl",
    "memory_patches": "memory_patches.jsonl",
    "source_reliability_events": "source_reliability_events.jsonl",
}


def iso_z(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_iso(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def clean_string(value: Any) -> str:
    return str(value or "").strip()


def to_float(value: Any, default: float = 0.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed == parsed and parsed not in (float("inf"), float("-inf")) else default


def round_money(value: Any) -> float:
    return round(to_float(value), 2)


def stable_id(prefix: str, *parts: Any) -> str:
    material = "\x1f".join(clean_string(part) for part in parts)
    digest = hashlib.sha256(material.encode("utf-8")).hexdigest()[:20]
    return f"{prefix}_{digest}"


def load_json(path: Path, default: Any) -> Any:
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default
    return default


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def append_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    if not records:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, sort_keys=True) + "\n")


def default_ledger() -> dict[str, Any]:
    ledger = engine_default_ledger(datetime.now(timezone.utc))
    ledger.update({"field_naming": FIELD_NAMING, "loop_topology": LOOP_TOPOLOGY})
    return ledger


def normalize_ledger(raw: dict[str, Any] | None) -> dict[str, Any]:
    ledger = engine_migrate_ledger(raw, datetime.now(timezone.utc))
    ledger.update({"field_naming": FIELD_NAMING, "loop_topology": LOOP_TOPOLOGY})
    return ledger


def load_ledger(path: Path) -> tuple[dict[str, Any], bool]:
    loaded = path.exists()
    if loaded:
        raw = load_json(path, default_ledger())
    else:
        raw = load_json(DEFAULT_LEDGER_SEED, default_ledger())
    return normalize_ledger(raw), loaded


def position_value(position: dict[str, Any], price_field: str, fallback: float = 0.0) -> float:
    explicit = position.get("paper_notional") or position.get("paperNotional") or position.get("market_value") or position.get("marketValue")
    if explicit is not None and price_field == "entry_price":
        return to_float(explicit, fallback)
    quantity = to_float(position.get("quantity") or position.get("units"), 0.0)
    price = to_float(position.get(price_field) or position.get(price_field.replace("_", "")), 0.0)
    return quantity * price if quantity and price else fallback


def summarize_book(book: dict[str, Any], ledger_loaded: bool, ledger_path: Path) -> dict[str, Any]:
    summary = engine_summarize_book(book)
    summary.update(
        {
            "loop_affinity": book["loop_affinity"],
            "instrument_type": book["instrument_type"],
            "strategy": book["strategy"],
            "ledger_loaded": ledger_loaded,
            "ledger_path": str(ledger_path),
        }
    )
    return summary


def source_ref_from_item(item: dict[str, Any], index: int) -> dict[str, Any]:
    source_id = clean_string(item.get("source_id") or item.get("sourceId") or item.get("source")) or "unknown_source"
    url = clean_string(item.get("url"))
    title = clean_string(item.get("title")) or "Untitled source item"
    source_ref = clean_string(item.get("id")) or stable_id("source", source_id, title, url, index)
    return {
        "source_ref": source_ref,
        "source_id": source_id,
        "source_name": clean_string(item.get("source_name") or item.get("sourceName")) or source_id,
        "source_class": clean_string(item.get("source_class") or item.get("sourceClass")) or "unknown",
        "lane": clean_string(item.get("lane")) or "unknown",
        "title": title,
        "url": url or None,
        "retrieved_at": clean_string(item.get("retrieved_at") or item.get("retrievedAt")) or None,
    }


def collect_source_snapshot(morning_state: Path) -> dict[str, Any]:
    warnings: list[str] = []
    manifest_path: Path | None = None
    state = load_json(morning_state, {})
    if isinstance(state, dict) and state.get("last_manifest_path"):
        manifest_path = Path(state["last_manifest_path"]).expanduser()
    else:
        warnings.append(f"morning brief state not found: {morning_state}")

    manifest = load_json(manifest_path, {}) if manifest_path else {}
    if manifest_path and not manifest:
        warnings.append(f"morning brief manifest unreadable: {manifest_path}")

    raw_items = manifest.get("all_items") if isinstance(manifest, dict) else []
    if not isinstance(raw_items, list):
        raw_items = []
    refs = [source_ref_from_item(item, index) for index, item in enumerate(raw_items) if isinstance(item, dict)]
    by_lane = {
        "mosaic": [ref for ref in refs if ref["lane"] == "mosaic"],
        "murmurs": [ref for ref in refs if ref["lane"] == "murmurs"],
        "bridge": [ref for ref in refs if ref["lane"] == "bridge"],
    }
    return {
        "manifest_path": str(manifest_path) if manifest_path else None,
        "generated_at": manifest.get("generated_at") if isinstance(manifest, dict) else None,
        "source_refs": refs,
        "source_refs_by_lane": by_lane,
        "warnings": warnings,
    }


def source_refs_for_loop(loop_id: str, snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    lanes = snapshot.get("source_refs_by_lane") or {}
    if loop_id == "mosaic":
        return lanes.get("mosaic", [])[:12]
    if loop_id == "murmurs":
        return lanes.get("murmurs", [])[:12]
    if loop_id in {"bridge", "paper", "narrative", "memory_sync"}:
        return (lanes.get("mosaic", []) + lanes.get("murmurs", []) + lanes.get("bridge", []))[:18]
    return snapshot.get("source_refs", [])[:18]


def make_run(loop_id: str, cadence: str, window: dict[str, str], now: datetime, source_refs: list[dict[str, Any]], warnings: list[str]) -> dict[str, Any]:
    meta = PRIMARY_LOOPS.get(loop_id) or SUPPORTING_LOOPS[loop_id]
    run_id = stable_id("run", cadence, loop_id, window["end"])
    return {
        "run_id": run_id,
        "loop_id": loop_id,
        "loop_role": meta["loop_role"],
        "agent": loop_id,
        "cadence": cadence,
        "started_at": iso_z(now),
        "ended_at": None,
        "status": "running",
        "time_window": window,
        "source_refs": [ref["source_ref"] for ref in source_refs],
        "output_refs": [],
        "warnings": warnings[:],
        "idempotency_key": stable_id("idem", cadence, loop_id, window["start"], window["end"]),
        "paper_only": True,
        "review_required": loop_id in {"bridge", "memory_sync"},
        "created_by": "mosaic_murmurs_local_loop",
        "created_from": "scripts/mosaic-murmurs-paper-memory-loop.py",
        "operator_scope": "local_operator",
    }


def fragment_body(loop_id: str, source_count: int, book_count: int, warnings: list[str]) -> tuple[str, str, str]:
    if loop_id == "mosaic":
        return (
            "Mosaic paper tick",
            f"I can prove this much: {source_count} evidence refs are available for this tick. I will not promote narrative into fact memory without review.",
            "clinical",
        )
    if loop_id == "murmurs":
        return (
            "Murmurs paper tick",
            f"The crowd signal is a weather system, not a verdict. {source_count} perception refs are queued for comparison against Mosaic.",
            "watchful",
        )
    if loop_id == "bridge":
        return (
            "Bridge delta check",
            "Truth, public belief, and market-implied belief are held apart until evidence survives review. Paper actions remain WATCH/AVOID unless guardrails pass.",
            "uncertain",
        )
    if loop_id == "paper":
        return (
            "Paper ledger mark",
            f"Marked {book_count} paper books. Balances are simulated; no account-bound order exists behind this record.",
            "clinical",
        )
    if loop_id == "source_health":
        return (
            "Source health check",
            "Source health recorded. Stale or missing source state suppresses paper buy/sell promotion.",
            "watchful" if not warnings else "alarm",
        )
    if loop_id == "memory_sync":
        return (
            "Memory sync queue",
            "Evidence-backed memory patches are queued for human review. No silent fact promotion.",
            "clinical",
        )
    return (
        "Narrative stream materialization",
        "Bounded stream fragments are audit objects first, voice second. Every fragment carries caveats or evidence refs.",
        "dream",
    )


def make_fragment(run: dict[str, Any], source_refs: list[dict[str, Any]], book_count: int, warnings: list[str], now: datetime) -> dict[str, Any]:
    title, body, tone = fragment_body(run["loop_id"], len(source_refs), book_count, warnings)
    caveats = warnings[:] if warnings else []
    if not source_refs:
        caveats.append("no fresh source refs available for this loop tick")
    fragment_id = stable_id("fragment", run["run_id"], title)
    return {
        "fragment_id": fragment_id,
        "agent": run["agent"],
        "loop_id": run["loop_id"],
        "loop_role": run["loop_role"],
        "cadence": run["cadence"],
        "run_id": run["run_id"],
        "generated_at": iso_z(now),
        "time_window": run["time_window"],
        "title": title,
        "body_markdown": body,
        "tone": tone,
        "linked_entities": [],
        "evidence_refs": [ref["source_ref"] for ref in source_refs[:8]],
        "paper_action_refs": [],
        "memory_refs": [],
        "caveats": caveats,
        "visibility": "operator_only",
        "paper_only": True,
    }


def make_memory_patches(runs: list[dict[str, Any]], now: datetime) -> list[dict[str, Any]]:
    patches = []
    for run in runs:
        if run["loop_id"] not in {"mosaic", "murmurs", "memory_sync"}:
            continue
        target = "claim_memory" if run["loop_id"] == "mosaic" else "perception_memory" if run["loop_id"] == "murmurs" else "calibration"
        patches.append(
            {
                "patch_id": stable_id("memory_patch", run["run_id"], target),
                "run_id": run["run_id"],
                "agent": run["agent"],
                "target": target,
                "action": "flag_for_review",
                "evidence_refs": run["source_refs"][:8],
                "summary": f"{run['agent']} {run['cadence']} tick completed; review source refs before merging durable memory.",
                "review_required": True,
                "status": "pending",
                "generated_at": iso_z(now),
                "paper_only": True,
            }
        )
    return patches


def make_source_events(run: dict[str, Any], snapshot: dict[str, Any], now: datetime) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    warnings = snapshot.get("warnings") or []
    if not warnings and snapshot.get("source_refs"):
        events.append(
            {
                "event_id": stable_id("source_event", run["run_id"], "healthy"),
                "run_id": run["run_id"],
                "source_id": "morning_brief_manifest",
                "event_type": "healthy",
                "severity": "info",
                "message": f"{len(snapshot.get('source_refs', []))} source refs available from latest morning manifest.",
                "generated_at": iso_z(now),
            }
        )
        return events
    for index, warning in enumerate(warnings or ["no source refs available"]):
        events.append(
            {
                "event_id": stable_id("source_event", run["run_id"], index, warning),
                "run_id": run["run_id"],
                "source_id": "morning_brief_manifest",
                "event_type": "stale_or_missing",
                "severity": "warning",
                "message": warning,
                "generated_at": iso_z(now),
            }
        )
    return events


def resolve_loop_ids(requested: list[str]) -> list[str]:
    if not requested or "all" in requested:
        return LOOP_ORDER[:]
    resolved: list[str] = []
    valid = set(LOOP_ORDER)
    for loop_id in requested:
        if loop_id not in valid:
            raise ValueError(f"unknown loop {loop_id!r}; expected one of {', '.join(LOOP_ORDER)} or all")
        if loop_id not in resolved:
            resolved.append(loop_id)
    return resolved


def run_tick(args: argparse.Namespace) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(hours=args.window_hours)
    window = {"start": iso_z(window_start), "end": iso_z(now)}
    ledger_path = Path(args.ledger).expanduser()
    state_dir = Path(args.state_dir).expanduser()
    ledger, ledger_loaded = load_ledger(ledger_path)
    snapshot = collect_source_snapshot(Path(args.morning_state).expanduser())
    if args.market_snapshot:
        market_snapshot = load_json(Path(args.market_snapshot).expanduser(), {})
    else:
        market_snapshot = collect_live_market_snapshot(now, timeout=args.market_timeout)
    market_errors = market_snapshot.get("errors") if isinstance(market_snapshot, dict) else []
    if market_errors:
        snapshot.setdefault("warnings", []).extend(
            f"market source {error.get('source_id', 'unknown')}: {error.get('error', 'unavailable')}"
            for error in market_errors
            if isinstance(error, dict)
        )
    loop_ids = resolve_loop_ids(args.loop)

    runs: list[dict[str, Any]] = []
    fragments: list[dict[str, Any]] = []
    output_refs_by_run: dict[str, list[str]] = {}
    for loop_id in loop_ids:
        refs = source_refs_for_loop(loop_id, snapshot)
        warnings = snapshot.get("warnings", [])[:]
        run = make_run(loop_id, args.cadence, window, now, refs, warnings)
        fragment = make_fragment(run, refs, len(ledger["books"]), warnings, now)
        runs.append(run)
        fragments.append(fragment)
        output_refs_by_run.setdefault(run["run_id"], []).append(fragment["fragment_id"])

    run_by_loop = {run["loop_id"]: run for run in runs}
    candidate_run = run_by_loop.get("bridge") or runs[0]
    paper_run = run_by_loop.get("paper") or candidate_run
    source_run = run_by_loop.get("source_health") or runs[-1]
    engine_key = args.idempotency_key or paper_run["idempotency_key"]
    engine_result = process_paper_tick(
        ledger,
        market_snapshot,
        now=now,
        run_idempotency_key=engine_key,
    )
    ledger = engine_result["ledger"]
    ledger.update({"field_naming": FIELD_NAMING, "loop_topology": LOOP_TOPOLOGY})
    books = [summarize_book(book, ledger_loaded, ledger_path) for book in ledger["books"]]
    action_candidates = engine_result["decisions"]
    ledger_events = engine_result["events"]
    for candidate in action_candidates:
        candidate.setdefault("run_id", candidate_run["run_id"])
    for event in ledger_events:
        event.setdefault("run_id", paper_run["run_id"])
    memory_patches = make_memory_patches(runs, now)
    source_events = make_source_events(source_run, snapshot, now)

    action_ids = [candidate["candidate_id"] for candidate in action_candidates]
    for fragment in fragments:
        if fragment["loop_id"] in {"bridge", "paper", "narrative"}:
            fragment["paper_action_refs"] = action_ids[:]
    output_refs_by_run.setdefault(candidate_run["run_id"], []).extend(action_ids)
    output_refs_by_run.setdefault(paper_run["run_id"], []).extend(event["event_id"] for event in ledger_events)
    for patch in memory_patches:
        output_refs_by_run.setdefault(patch["run_id"], []).append(patch["patch_id"])
    output_refs_by_run.setdefault(source_run["run_id"], []).extend(event["event_id"] for event in source_events)

    ended_at = iso_z(datetime.now(timezone.utc))
    for run in runs:
        run["ended_at"] = ended_at
        run["output_refs"] = output_refs_by_run.get(run["run_id"], [])
        run["status"] = "review_required" if run["loop_id"] in {"bridge", "memory_sync"} or run["review_required"] else "completed"

    paper_state = build_paper_state(ledger, books, action_candidates, ledger_events, now)
    paper_state_sync: dict[str, Any] = {"configured": bool(args.paper_sync_url), "attempted": False}
    if args.paper_sync_url and not args.dry_run:
        paper_state_sync["attempted"] = True
        try:
            token = os.environ.get("BSS_PAPER_STATE_TOKEN", "").strip() or read_token_file(args.paper_sync_token_file)
            paper_state_sync.update(
                sync_paper_state(
                    args.paper_sync_url,
                    token,
                    engine_key,
                    paper_state,
                    timeout=args.paper_sync_timeout,
                )
            )
        except PaperSyncError as exc:
            paper_state_sync.update({"ok": False, "error": str(exc)})
            snapshot.setdefault("warnings", []).append(str(exc))

    latest_state = {
        "schema_version": 2,
        "updated_at": ended_at,
        "field_naming": FIELD_NAMING,
        "loop_topology": LOOP_TOPOLOGY,
        "cadence": args.cadence,
        "time_window": window,
        "paper_only": True,
        "autonomous_execution": True,
        "human_review_required_for_actions": False,
        "engine_idempotency_key": engine_key,
        "engine_replayed": engine_result["replayed"],
        "canonical_paper_state": paper_state,
        "paper_state_sync": paper_state_sync,
        "ledger_path": str(ledger_path),
        "state_dir": str(state_dir),
        "source_manifest_path": snapshot.get("manifest_path"),
        "market_snapshot_path": str(Path(args.market_snapshot).expanduser()) if args.market_snapshot else None,
        "market_instrument_count": len(market_snapshot.get("instruments", [])) if isinstance(market_snapshot, dict) else 0,
        "market_source_errors": market_errors or [],
        "source_warning_count": len(snapshot.get("warnings") or []),
        "paper_books": books,
        "last_runs": runs,
        "last_narrative_fragments": fragments,
        "last_paper_action_candidates": action_candidates,
        "last_paper_ledger_events": ledger_events,
        "last_memory_patches": memory_patches,
        "last_source_reliability_events": source_events,
        "record_files": {name: str(state_dir / filename) for name, filename in RECORD_FILES.items()},
    }

    if not args.dry_run:
        write_json(ledger_path, ledger)
        append_jsonl(state_dir / RECORD_FILES["agent_loop_runs"], runs)
        append_jsonl(state_dir / RECORD_FILES["narrative_fragments"], fragments)
        append_jsonl(state_dir / RECORD_FILES["paper_action_candidates"], action_candidates)
        append_jsonl(state_dir / RECORD_FILES["paper_ledger_events"], ledger_events)
        append_jsonl(state_dir / RECORD_FILES["memory_patches"], memory_patches)
        append_jsonl(state_dir / RECORD_FILES["source_reliability_events"], source_events)
        write_json(state_dir / "latest_state.json", latest_state)

    return latest_state


def cron_packet(state: dict[str, Any]) -> dict[str, Any]:
    return {
        "ok": True,
        "paper_only": True,
        "field_naming": state["field_naming"],
        "loop_topology": state["loop_topology"],
        "cadence": state["cadence"],
        "updated_at": state["updated_at"],
        "run_ids": [run["run_id"] for run in state["last_runs"]],
        "primary_runs": [run["run_id"] for run in state["last_runs"] if run["loop_role"] == "primary"],
        "supporting_runs": [run["run_id"] for run in state["last_runs"] if run["loop_role"] == "supporting"],
        "paper_book_count": len(state["paper_books"]),
        "paper_books": [
            {
                "book_id": book["book_id"],
                "display_name": book["display_name"],
                "starting_balance": book["starting_balance"],
                "cash_balance": book["cash_balance"],
                "gross_paper_exposure": book["gross_paper_exposure"],
                "equity": book["equity"],
                "status": book["status"],
            }
            for book in state["paper_books"]
        ],
        "paper_action_candidate_count": len(state["last_paper_action_candidates"]),
        "paper_state_sync": state["paper_state_sync"],
        "source_warning_count": state["source_warning_count"],
        "latest_state_path": str(Path(state["state_dir"]) / "latest_state.json"),
    }


def configured_paper_sync_url() -> str:
    from_env = os.environ.get("BSS_PAPER_STATE_URL", "").strip()
    if from_env:
        return from_env
    try:
        return DEFAULT_PAPER_SYNC_URL_FILE.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--loop", action="append", choices=["all", *LOOP_ORDER], default=[], help="Loop to run. Repeatable. Default: all.")
    parser.add_argument("--cadence", default="paper_tick", choices=["pulse", "paper_tick", "wake_brief", "dream_consolidation", "operator_review"])
    parser.add_argument("--ledger", default=str(DEFAULT_LEDGER))
    parser.add_argument("--state-dir", default=str(DEFAULT_STATE_DIR))
    parser.add_argument("--morning-state", default=str(DEFAULT_MORNING_STATE))
    parser.add_argument("--market-snapshot", help="Read a deterministic market snapshot JSON instead of fetching public marks.")
    parser.add_argument("--market-timeout", type=int, default=12)
    parser.add_argument("--idempotency-key", help="Override the deterministic engine tick key; useful for replay-safe orchestration.")
    parser.add_argument("--paper-sync-url", default=configured_paper_sync_url(), help="Optional VM canonical paper-state endpoint.")
    parser.add_argument("--paper-sync-token-file", default=str(Path.home() / ".config" / "blue-swallow" / "paper-state-token"))
    parser.add_argument("--paper-sync-timeout", type=int, default=12)
    parser.add_argument("--window-hours", type=int, default=1)
    parser.add_argument("--full", action="store_true", help="Print latest_state instead of a compact cron packet.")
    parser.add_argument("--dry-run", action="store_true", help="Build records without writing ledger/state files.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    state = run_tick(args)
    print(json.dumps(state if args.full else cron_packet(state), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
