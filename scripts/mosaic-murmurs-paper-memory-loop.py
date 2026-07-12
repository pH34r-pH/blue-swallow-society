#!/usr/bin/env python3
"""Run Mosaic & Murmurs paper-memory loop ticks.

The loop runtime is deliberately local-first and dependency-free. It writes
append-only JSONL records with canonical snake_case field names, keeps the
SWA/browser side read-only, and prepares paper-only review candidates without
real-money execution.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
DEFAULT_LEDGER = REPO_ROOT / "config" / "mosaic-murmurs-paper-ledger.json"
DEFAULT_STATE_DIR = Path.home() / ".hermes" / "mosaic-murmurs" / "paper-memory-loop"
DEFAULT_MORNING_STATE = Path.home() / ".hermes" / "mosaic-murmurs" / "morning-brief" / "state.json"
BOOK_STARTING_BALANCE = 1_000.0

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

BOOK_SPECS: list[dict[str, Any]] = [
    {
        "book_id": "prediction_markets",
        "display_name": "Prediction Markets",
        "loop_affinity": "bridge",
        "instrument_type": "prediction_market",
        "strategy": "Paper-only probability deltas where Mosaic evidence and Murmurs belief diverge from market-implied odds.",
    },
    {
        "book_id": "crypto",
        "display_name": "Crypto",
        "loop_affinity": "bridge",
        "instrument_type": "crypto",
        "strategy": "Paper-only liquid crypto momentum/reversion signals from public market and perception feeds.",
    },
    {
        "book_id": "equity_watch",
        "display_name": "Equity Watch",
        "loop_affinity": "mosaic",
        "instrument_type": "equity_watch",
        "strategy": "Paper-only watchlist for public-company, macro, and regulatory signals; no brokerage execution.",
    },
    {
        "book_id": "local_event_watch",
        "display_name": "Local Event Watch",
        "loop_affinity": "mosaic",
        "instrument_type": "local_event_watch",
        "strategy": "Paper-only Seattle/Bellevue/Redmond and Washington State event-risk theses.",
    },
    {
        "book_id": "ai_cyber_watch",
        "display_name": "AI/Cyber Watch",
        "loop_affinity": "murmurs",
        "instrument_type": "other_paper_only",
        "strategy": "Paper-only AI, security, breach, and agent-tooling hype/fact deltas.",
    },
]

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
    return {
        "schema_version": 2,
        "currency": "USD",
        "updated_at": None,
        "field_naming": FIELD_NAMING,
        "loop_topology": LOOP_TOPOLOGY,
        "notes": "Paper-only Mosaic & Murmurs ledger. No real-money execution; every action candidate remains human-reviewable.",
        "books": [],
    }


def normalize_ledger(raw: dict[str, Any] | None) -> dict[str, Any]:
    ledger = dict(raw) if isinstance(raw, dict) else default_ledger()
    existing: dict[str, dict[str, Any]] = {}
    for raw_book in ledger.get("books", []) or []:
        if not isinstance(raw_book, dict):
            continue
        book_id = clean_string(raw_book.get("book_id") or raw_book.get("id"))
        if book_id:
            existing[book_id] = dict(raw_book)

    normalized_books: list[dict[str, Any]] = []
    for spec in BOOK_SPECS:
        old = existing.get(spec["book_id"], {})
        starting_balance = to_float(old.get("starting_balance", old.get("starting_equity")), BOOK_STARTING_BALANCE)
        if starting_balance <= 0:
            starting_balance = BOOK_STARTING_BALANCE
        closed_pnl = round_money(old.get("closed_pnl", old.get("closedPnl", 0.0)))
        cash_balance = to_float(old.get("cash_balance", old.get("cash", old.get("available_cash"))), starting_balance)
        high_water = max(
            to_float(old.get("high_water_mark", old.get("highWaterMark")), starting_balance),
            starting_balance,
        )
        positions = old.get("positions") if isinstance(old.get("positions"), list) else []
        normalized_books.append(
            {
                "book_id": spec["book_id"],
                "display_name": clean_string(old.get("display_name")) or spec["display_name"],
                "loop_affinity": clean_string(old.get("loop_affinity")) or spec["loop_affinity"],
                "instrument_type": clean_string(old.get("instrument_type")) or spec["instrument_type"],
                "strategy": clean_string(old.get("strategy")) or spec["strategy"],
                "starting_balance": round_money(starting_balance),
                "cash_balance": round_money(cash_balance),
                "closed_pnl": closed_pnl,
                "high_water_mark": round_money(high_water),
                "positions": positions,
                "status": clean_string(old.get("status")) or "active",
            }
        )

    ledger.update(
        {
            "schema_version": 2,
            "currency": clean_string(ledger.get("currency")) or "USD",
            "updated_at": iso_z(datetime.now(timezone.utc)),
            "field_naming": FIELD_NAMING,
            "loop_topology": LOOP_TOPOLOGY,
            "books": normalized_books,
        }
    )
    return ledger


def load_ledger(path: Path) -> tuple[dict[str, Any], bool]:
    raw = load_json(path, default_ledger())
    return normalize_ledger(raw), path.exists()


def position_value(position: dict[str, Any], price_field: str, fallback: float = 0.0) -> float:
    explicit = position.get("paper_notional") or position.get("paperNotional") or position.get("market_value") or position.get("marketValue")
    if explicit is not None and price_field == "entry_price":
        return to_float(explicit, fallback)
    quantity = to_float(position.get("quantity") or position.get("units"), 0.0)
    price = to_float(position.get(price_field) or position.get(price_field.replace("_", "")), 0.0)
    return quantity * price if quantity and price else fallback


def summarize_book(book: dict[str, Any], ledger_loaded: bool, ledger_path: Path) -> dict[str, Any]:
    positions = [position for position in (book.get("positions") or []) if isinstance(position, dict)]
    open_positions = [position for position in positions if not position.get("closed_at") and not position.get("closedAt")]
    gross_exposure = 0.0
    daily_pnl = 0.0
    cumulative_pnl = to_float(book.get("closed_pnl"), 0.0)
    stale_open_marks = 0

    for position in open_positions:
        if not isinstance(position, dict):
            continue
        entry_value = position_value(position, "entry_price") or to_float(position.get("cost_basis"), 0.0)
        previous_value = position_value(position, "previous_mark_price", entry_value)
        current_mark = position.get("mark_price") or position.get("markPrice") or position.get("current_price") or position.get("currentPrice")
        if current_mark is None:
            stale_open_marks += 1
            gross_exposure += entry_value
            continue
        current_value = position_value(position, "mark_price", entry_value)
        gross_exposure += current_value
        daily_pnl += current_value - previous_value
        cumulative_pnl += current_value - entry_value

    starting_balance = to_float(book.get("starting_balance"), BOOK_STARTING_BALANCE)
    equity = starting_balance + cumulative_pnl
    high_water_mark = max(to_float(book.get("high_water_mark"), starting_balance), equity, starting_balance)
    drawdown_pct = ((high_water_mark - equity) / high_water_mark * 100.0) if high_water_mark else 0.0
    daily_pnl_pct = (daily_pnl / starting_balance * 100.0) if starting_balance else 0.0
    cumulative_pnl_pct = (cumulative_pnl / starting_balance * 100.0) if starting_balance else 0.0
    status = "stale" if stale_open_marks else "flat" if not open_positions else "up" if cumulative_pnl > 0 else "down" if cumulative_pnl < 0 else "flat"

    return {
        "book_id": book["book_id"],
        "display_name": book["display_name"],
        "loop_affinity": book["loop_affinity"],
        "instrument_type": book["instrument_type"],
        "strategy": book["strategy"],
        "starting_balance": round_money(starting_balance),
        "cash_balance": round_money(book.get("cash_balance", starting_balance)),
        "equity": round_money(equity),
        "open_position_count": len(open_positions),
        "gross_paper_exposure": round_money(gross_exposure),
        "daily_pnl": round_money(daily_pnl),
        "daily_pnl_pct": round(daily_pnl_pct, 2),
        "cumulative_pnl": round_money(cumulative_pnl),
        "cumulative_pnl_pct": round(cumulative_pnl_pct, 2),
        "drawdown_pct": round(drawdown_pct, 2),
        "stale_open_marks": stale_open_marks,
        "status": status,
        "ledger_loaded": ledger_loaded,
        "ledger_path": str(ledger_path),
    }


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


def make_action_candidates(run: dict[str, Any], books: list[dict[str, Any]], source_refs: list[dict[str, Any]], now: datetime) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    expires_at = iso_z(now + timedelta(hours=24))
    evidence_refs = [ref["source_ref"] for ref in source_refs[:6]]
    for book in books:
        action = "WATCH"
        candidate_id = stable_id("candidate", run["run_id"], book["book_id"], action)
        candidates.append(
            {
                "candidate_id": candidate_id,
                "run_id": run["run_id"],
                "action": action,
                "book_id": book["book_id"],
                "instrument_type": book["instrument_type"],
                "instrument_ref": f"paper_book:{book['book_id']}",
                "paper_size": 0.0,
                "thesis": f"Keep {book['display_name']} active with ${book['starting_balance']:.0f} paper starting balance; wait for reviewed Mosaic/Murmurs delta before PAPER BUY/SELL.",
                "mosaic_claim_refs": evidence_refs if book["loop_affinity"] in {"mosaic", "bridge"} else [],
                "murmur_cluster_refs": evidence_refs if book["loop_affinity"] in {"murmurs", "bridge"} else [],
                "perceptual_delta_refs": [stable_id("delta", run["run_id"], book["book_id"])],
                "evidence_refs": evidence_refs,
                "counter_evidence_refs": [],
                "entry_condition": "Promote only after Mosaic evidence, Murmurs perception motion, and market/instrument mark are fresh enough for review.",
                "exit_condition": "Expire if source state is stale, thesis is falsified, or human review rejects the packet.",
                "expires_at": expires_at,
                "confidence": "low" if not evidence_refs else "medium",
                "review_required": True,
                "status": "queued",
                "paper_only": True,
                "human_review_required": True,
            }
        )
    return candidates


def make_ledger_events(run: dict[str, Any], books: list[dict[str, Any]], now: datetime) -> list[dict[str, Any]]:
    events = []
    for book in books:
        events.append(
            {
                "event_id": stable_id("ledger_event", run["run_id"], book["book_id"], "mark"),
                "run_id": run["run_id"],
                "book_id": book["book_id"],
                "event_type": "mark",
                "generated_at": iso_z(now),
                "starting_balance": book["starting_balance"],
                "cash_balance": book["cash_balance"],
                "equity": book["equity"],
                "gross_paper_exposure": book["gross_paper_exposure"],
                "daily_pnl": book["daily_pnl"],
                "cumulative_pnl": book["cumulative_pnl"],
                "status": book["status"],
                "paper_only": True,
                "review_required": False,
            }
        )
    return events


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
    books = [summarize_book(book, ledger_loaded, ledger_path) for book in ledger["books"]]
    snapshot = collect_source_snapshot(Path(args.morning_state).expanduser())
    loop_ids = resolve_loop_ids(args.loop)

    runs: list[dict[str, Any]] = []
    fragments: list[dict[str, Any]] = []
    output_refs_by_run: dict[str, list[str]] = {}
    for loop_id in loop_ids:
        refs = source_refs_for_loop(loop_id, snapshot)
        warnings = snapshot.get("warnings", [])[:]
        run = make_run(loop_id, args.cadence, window, now, refs, warnings)
        fragment = make_fragment(run, refs, len(books), warnings, now)
        runs.append(run)
        fragments.append(fragment)
        output_refs_by_run.setdefault(run["run_id"], []).append(fragment["fragment_id"])

    run_by_loop = {run["loop_id"]: run for run in runs}
    candidate_run = run_by_loop.get("bridge") or runs[0]
    paper_run = run_by_loop.get("paper") or candidate_run
    source_run = run_by_loop.get("source_health") or runs[-1]
    action_candidates = make_action_candidates(candidate_run, books, source_refs_for_loop("bridge", snapshot), now)
    ledger_events = make_ledger_events(paper_run, books, now)
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

    latest_state = {
        "schema_version": 2,
        "updated_at": ended_at,
        "field_naming": FIELD_NAMING,
        "loop_topology": LOOP_TOPOLOGY,
        "cadence": args.cadence,
        "time_window": window,
        "paper_only": True,
        "human_review_required_for_actions": True,
        "ledger_path": str(ledger_path),
        "state_dir": str(state_dir),
        "source_manifest_path": snapshot.get("manifest_path"),
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
                "equity": book["equity"],
                "status": book["status"],
            }
            for book in state["paper_books"]
        ],
        "paper_action_candidate_count": len(state["last_paper_action_candidates"]),
        "source_warning_count": state["source_warning_count"],
        "latest_state_path": str(Path(state["state_dir"]) / "latest_state.json"),
    }


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--loop", action="append", choices=["all", *LOOP_ORDER], default=[], help="Loop to run. Repeatable. Default: all.")
    parser.add_argument("--cadence", default="paper_tick", choices=["pulse", "paper_tick", "wake_brief", "dream_consolidation", "operator_review"])
    parser.add_argument("--ledger", default=str(DEFAULT_LEDGER))
    parser.add_argument("--state-dir", default=str(DEFAULT_STATE_DIR))
    parser.add_argument("--morning-state", default=str(DEFAULT_MORNING_STATE))
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
