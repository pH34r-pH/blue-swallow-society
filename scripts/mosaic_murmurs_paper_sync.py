#!/usr/bin/env python3
"""Canonical paper-state envelope and authenticated VM synchronization helpers."""

from __future__ import annotations

import copy
import json
import math
import os
import re
import stat
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


SCHEMA_VERSION = "bss.paper_state.v2"
PAPER_LINE_IDS = ["standard", "aggressive", "hyper_aggressive"]
PAPER_STRATEGY_IDS = [
    "prediction_markets",
    "crypto",
    "equity_watch",
    "local_event_watch",
    "ai_cyber_watch",
    "cross_asset_momentum",
    "contrarian_reversion",
    "volatility_barbell",
]
PAPER_BOOK_IDS = [f"{line_id}__{strategy_id}" for line_id in PAPER_LINE_IDS for strategy_id in PAPER_STRATEGY_IDS]
STATE_KEYS = {"schema_version", "generated_at", "paper_only", "autonomous_execution", "ledger", "paper_books", "paper_action_candidates", "paper_ledger_events", "recent_paper_trades", "governance"}
LEDGER_KEYS = {"schema_version", "currency", "paper_only", "autonomous_execution", "book_dimensions", "books", "archived_books", "processed_idempotency_keys", "updated_at"}
DIMENSION_KEYS = {"lines", "strategies"}
LINE_KEYS = {"line_id", "display_name", "order"}
STRATEGY_KEYS = {"strategy_id", "display_name", "order"}
BOOK_KEYS = {
    "book_id", "display_name", "line_id", "line_display_name", "strategy_id", "strategy_display_name", "aggression_profile",
    "loop_affinity", "instrument_type", "strategy", "starting_balance", "cash_balance", "initial_bank_capital",
    "initial_investment_capital", "additional_capital_contribution", "funding_migration_applied", "initial_allocation_complete",
    "initial_allocation_at", "positions", "realized_pnl", "equity", "previous_equity", "high_water_mark", "max_drawdown_pct",
    "last_trade_at", "last_decision_at", "status", "postmortem_required", "crashed_at", "crash_reason", "created_at", "updated_at",
}
PROFILE_KEYS = {"target_gross_fraction", "max_position_fraction", "target_position_count", "minimum_order_notional"}
POSITION_KEYS = {
    "position_id", "instrument_ref", "instrument_type", "symbol", "title", "quantity", "entry_price", "mark_price",
    "previous_mark_price", "cost_basis", "market_value", "mark_status", "source_id", "source_url", "opened_at", "updated_at",
}
SUMMARY_KEYS = {
    "book_id", "display_name", "line_id", "line_display_name", "strategy_id", "strategy_display_name", "aggression_profile",
    "starting_balance", "cash_balance", "realized_pnl", "unrealized_pnl", "gross_paper_exposure", "equity", "daily_pnl",
    "daily_pnl_pct", "cumulative_pnl", "cumulative_pnl_pct", "drawdown_pct", "max_drawdown_pct", "open_position_count",
    "stale_open_marks", "postmortem_required", "crashed_at", "status",
}
ACTION_KEYS = {
    "candidate_id", "decision_id", "idempotency_key", "book_id", "action", "status", "instrument_ref", "instrument_type",
    "symbol", "paper_size", "mark_price", "thesis", "risk_policy_checks", "risk_policy_passed", "paper_only",
    "autonomous_execution", "human_review_required", "review_required", "generated_at", "source_ref", "source_url",
}
FILL_KEYS = {
    "event_id", "decision_id", "idempotency_key", "book_id", "event_type", "action", "instrument_ref", "quantity",
    "mark_price", "paper_size", "realized_pnl", "cash_before", "cash_after", "position_quantity_before",
    "position_quantity_after", "generated_at", "paper_only", "autonomous_execution",
}
CRASH_KEYS = {"event_id", "idempotency_key", "book_id", "event_type", "equity", "generated_at", "paper_only", "postmortem_required"}
MARK_KEYS = {"event_id", "idempotency_key", "event_type", "generated_at", "paper_only", *SUMMARY_KEYS}
GOVERNANCE_KEYS = {"paper_only", "autonomous_paper_execution", "human_review_required_for_actions", "no_real_money_execution", "stale_marks_block_new_buys", "crash_requires_postmortem", "loss_budget"}
ARCHIVE_KEYS = {"book_id", "archived_at", "archive_reason"}
LOCAL_SUMMARY_KEYS = {"instrument_type", "strategy", "ledger_loaded", "ledger_path", "loop_affinity"}


class PaperSyncError(RuntimeError):
    pass


def iso_z(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _has_exact_ids(values: list[Any], expected: list[str]) -> bool:
    return len(values) == len(expected) and len(set(values)) == len(expected) and set(values) == set(expected)


def _finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _valid_timestamp(value: Any) -> bool:
    if not isinstance(value, str) or not value:
        return False
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return parsed.tzinfo is not None


def _validate_canonical_state_parts(
    ledger: Any,
    paper_books: Any,
    actions: Any,
    events: Any,
    recent_trades: Any,
) -> None:
    if not isinstance(ledger, dict) or ledger.get("schema_version") != 4 or ledger.get("paper_only") is not True:
        raise ValueError("paper ledger schema 4 with paper_only=true is required")
    books = ledger.get("books")
    dimensions = ledger.get("book_dimensions")
    if not isinstance(books, list) or not isinstance(dimensions, dict):
        raise ValueError("paper ledger books and dimensions are required")
    line_entries = dimensions.get("lines")
    strategy_entries = dimensions.get("strategies")
    if not isinstance(line_entries, list) or not isinstance(strategy_entries, list):
        raise ValueError("paper ledger dimensions must be arrays")
    line_ids = [item.get("line_id") for item in line_entries if isinstance(item, dict)]
    strategy_ids = [item.get("strategy_id") for item in strategy_entries if isinstance(item, dict)]
    if not _has_exact_ids(line_ids, PAPER_LINE_IDS) or not _has_exact_ids(strategy_ids, PAPER_STRATEGY_IDS):
        raise ValueError("paper ledger must define the canonical three lines and eight strategies")

    book_ids: list[str] = []
    for book in books:
        if not isinstance(book, dict):
            raise ValueError("every paper book must be an object")
        book_id = book.get("book_id")
        line_id = book.get("line_id")
        strategy_id = book.get("strategy_id")
        if book_id != f"{line_id}__{strategy_id}" or book_id not in PAPER_BOOK_IDS:
            raise ValueError("paper book matrix identity is invalid")
        if not all(_finite_number(book.get(field)) for field in ("starting_balance", "initial_bank_capital", "initial_investment_capital", "cash_balance")):
            raise ValueError("paper book accounting fields must be finite numbers")
        if book["starting_balance"] != 2000 or book["initial_bank_capital"] != 1000 or book["initial_investment_capital"] != 1000 or book["cash_balance"] < 0:
            raise ValueError("paper book capital contract is invalid")
        if not isinstance(book.get("positions"), list):
            raise ValueError("paper book positions must be an array")
        book_ids.append(book_id)
    if not _has_exact_ids(book_ids, PAPER_BOOK_IDS):
        raise ValueError("paper ledger must contain all 24 canonical books exactly once")

    if not isinstance(paper_books, list):
        raise ValueError("paper summaries must be an array")
    summary_ids: list[str] = []
    for summary in paper_books:
        if not isinstance(summary, dict) or summary.get("book_id") not in PAPER_BOOK_IDS:
            raise ValueError("every paper summary must reference a canonical book")
        if summary.get("line_id") is not None and summary.get("book_id") != f"{summary.get('line_id')}__{summary.get('strategy_id')}":
            raise ValueError("paper summary matrix identity is invalid")
        if not all(_finite_number(summary.get(field)) for field in ("starting_balance", "cash_balance", "gross_paper_exposure", "equity")):
            raise ValueError("paper summary accounting fields must be finite numbers")
        summary_ids.append(summary["book_id"])
    if not _has_exact_ids(summary_ids, PAPER_BOOK_IDS):
        raise ValueError("paper summaries must contain all 24 canonical books exactly once")

    for label, records in (("actions", actions), ("events", events), ("recent trades", recent_trades)):
        if not isinstance(records, list) or any(not isinstance(item, dict) for item in records):
            raise ValueError(f"paper {label} must be arrays of objects")
    if len(recent_trades) > 64:
        raise ValueError("recent paper trades are capped at 64 fills")
    if len(actions) > 256 or len(events) > 256:
        raise ValueError("paper action/event collections exceed canonical bounds")
    for item in [*actions, *events, *recent_trades]:
        if item.get("paper_only") is not True or item.get("book_id") not in PAPER_BOOK_IDS:
            raise ValueError("all paper actions and events must be paper-only and reference canonical books")
        if not _valid_timestamp(item.get("generated_at")):
            raise ValueError("all paper actions and events require timezone-qualified generated_at")
    event_ids = [item.get("event_id") for item in recent_trades]
    if any(item.get("event_type") != "paper_fill" for item in recent_trades) or any(not isinstance(event_id, str) or not event_id for event_id in event_ids) or len(set(event_ids)) != len(event_ids):
        raise ValueError("recent paper trades must be unique canonical paper_fill events")


def _require_exact_keys(value: Any, allowed: set[str], label: str) -> None:
    if not isinstance(value, dict) or set(value) != allowed:
        raise ValueError(f"{label} does not match the closed canonical schema")


def _validate_closed_state(value: dict[str, Any]) -> None:
    _require_exact_keys(value, STATE_KEYS, "paper state")
    ledger = value.get("ledger")
    _require_exact_keys(ledger, LEDGER_KEYS, "paper ledger")
    dimensions = ledger.get("book_dimensions")
    _require_exact_keys(dimensions, DIMENSION_KEYS, "book dimensions")
    for line in dimensions.get("lines", []):
        _require_exact_keys(line, LINE_KEYS, "line dimension")
    for strategy in dimensions.get("strategies", []):
        _require_exact_keys(strategy, STRATEGY_KEYS, "strategy dimension")
    for book in ledger.get("books", []):
        _require_exact_keys(book, BOOK_KEYS, "paper book")
        _require_exact_keys(book.get("aggression_profile"), PROFILE_KEYS, "aggression profile")
        for position in book.get("positions", []):
            _require_exact_keys(position, POSITION_KEYS, "paper position")
    for archived in ledger.get("archived_books", []):
        _require_exact_keys(archived, ARCHIVE_KEYS, "archived book")
    for summary in value.get("paper_books", []):
        _require_exact_keys(summary, SUMMARY_KEYS, "paper summary")
        _require_exact_keys(summary.get("aggression_profile"), PROFILE_KEYS, "summary aggression profile")
    for action in value.get("paper_action_candidates", []):
        _require_exact_keys(action, ACTION_KEYS, "paper action")
    for collection_name in ("paper_ledger_events", "recent_paper_trades"):
        for event in value.get(collection_name, []):
            event_type = event.get("event_type") if isinstance(event, dict) else None
            keys = FILL_KEYS if event_type == "paper_fill" else MARK_KEYS if event_type == "mark" else CRASH_KEYS if event_type == "book_crashed" else set()
            _require_exact_keys(event, keys, f"{collection_name} event")
    _require_exact_keys(value.get("governance"), GOVERNANCE_KEYS, "paper governance")


def validate_paper_state(value: Any) -> None:
    if not isinstance(value, dict):
        raise ValueError("paper state must be an object")
    _validate_closed_state(value)
    _validate_canonical_state_parts(
        value.get("ledger"),
        value.get("paper_books"),
        value.get("paper_action_candidates"),
        value.get("paper_ledger_events"),
        value.get("recent_paper_trades"),
    )


def _sanitized_sync_ledger(ledger: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema_version": ledger["schema_version"],
        "currency": ledger.get("currency", "USD"),
        "paper_only": True,
        "autonomous_execution": ledger.get("autonomous_execution") is True,
        "book_dimensions": copy.deepcopy(ledger["book_dimensions"]),
        "books": copy.deepcopy(ledger["books"]),
        "archived_books": [
            {
                "book_id": str(book.get("book_id") or book.get("id") or "unknown"),
                "archived_at": book.get("archived_at"),
                "archive_reason": book.get("archive_reason"),
            }
            for book in (ledger.get("archived_books") or [])[-64:]
            if isinstance(book, dict)
        ],
        "processed_idempotency_keys": copy.deepcopy((ledger.get("processed_idempotency_keys") or [])[-512:]),
        "updated_at": ledger.get("updated_at"),
    }


def build_paper_state(
    ledger: dict[str, Any],
    paper_books: list[dict[str, Any]],
    actions: list[dict[str, Any]],
    events: list[dict[str, Any]],
    generated_at: datetime,
    *,
    recent_trades: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    trades = recent_trades or []
    _validate_canonical_state_parts(ledger, paper_books, actions, events, trades)
    for summary in paper_books:
        unknown = set(summary) - SUMMARY_KEYS - LOCAL_SUMMARY_KEYS
        if unknown:
            raise ValueError(f"paper summary contains unsupported fields: {sorted(unknown)}")
    sync_books = [{key: copy.deepcopy(value) for key, value in summary.items() if key in SUMMARY_KEYS} for summary in paper_books]
    sync_actions = [{key: copy.deepcopy(value) for key, value in action.items() if key != "run_id"} for action in actions]
    sync_events = [{key: copy.deepcopy(value) for key, value in event.items() if key != "run_id"} for event in events]
    sync_trades = [{key: copy.deepcopy(value) for key, value in event.items() if key != "run_id"} for event in trades]
    envelope = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": iso_z(generated_at),
        "paper_only": True,
        "autonomous_execution": True,
        "ledger": _sanitized_sync_ledger(ledger),
        "paper_books": sync_books,
        "paper_action_candidates": sync_actions,
        "paper_ledger_events": sync_events,
        "recent_paper_trades": sync_trades,
        "governance": {
            "paper_only": True,
            "autonomous_paper_execution": True,
            "human_review_required_for_actions": any(action.get("human_review_required") is True for action in sync_actions),
            "no_real_money_execution": True,
            "stale_marks_block_new_buys": True,
            "crash_requires_postmortem": True,
            "loss_budget": "entire_book_balance",
        },
    }
    validate_paper_state(envelope)
    return envelope


def read_token_file(path: str | Path | None) -> str:
    if not path:
        return ""
    token_path = Path(path).expanduser()
    descriptor: int | None = None
    try:
        flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
        descriptor = os.open(token_path, flags)
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode):
            raise PaperSyncError(f"paper state token path must be a regular file: {token_path}")
        if metadata.st_uid != os.getuid() or stat.S_IMODE(metadata.st_mode) != 0o600:
            raise PaperSyncError(f"paper state token file must be owned by the current user with mode 0600: {token_path}")
        raw = os.read(descriptor, 4097)
        if len(raw) > 4096:
            raise PaperSyncError("paper state token file exceeds 4096 bytes")
        token = raw.decode("utf-8", errors="strict").strip()
    except PaperSyncError:
        raise
    except (OSError, UnicodeDecodeError) as exc:
        raise PaperSyncError(f"paper state token file is unavailable or invalid: {token_path}") from exc
    finally:
        if descriptor is not None:
            os.close(descriptor)
    return token


def sync_paper_state(
    url: str,
    token: str,
    idempotency_key: str,
    state: dict[str, Any],
    *,
    timeout: int = 12,
    opener: Callable[..., Any] = urlopen,
) -> dict[str, Any]:
    parsed = urlparse(str(url).strip())
    loopback = (parsed.hostname or "").lower() in {"localhost", "127.0.0.1", "::1"}
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
        raise PaperSyncError("paper state URL must be an HTTP(S) endpoint without embedded credentials or fragments")
    if parsed.scheme != "https" and not loopback:
        raise PaperSyncError("paper state URL must use HTTPS unless it targets loopback")
    if not re.fullmatch(r"[A-Za-z0-9._~+:/=-]{32,256}", token or ""):
        raise PaperSyncError("paper state token must contain 32-256 header-safe characters")
    if not re.fullmatch(r"[A-Za-z0-9._:~-]{1,200}", idempotency_key or ""):
        raise PaperSyncError("paper state idempotency key must contain 1-200 URL/header-safe characters")
    try:
        validate_paper_state(state)
    except ValueError as exc:
        raise PaperSyncError(f"paper state envelope is invalid: {exc}") from exc
    payload = json.dumps(state, separators=(",", ":"), sort_keys=True).encode("utf-8")
    request = Request(
        url,
        data=payload,
        method="PUT",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Idempotency-Key": idempotency_key,
            "X-Blue-Swallow-Paper-State-Token": token,
            "User-Agent": "BlueSwallowPaperEngine/1.0 (+https://blueswallow.net)",
        },
    )
    try:
        with opener(request, timeout=timeout) as response:
            raw = response.read(1_000_000)
            body = json.loads(raw.decode("utf-8")) if raw else {}
            status_code = int(response.status)
            replay_header = str(response.headers.get("Idempotent-Replayed", "")).lower()
            if replay_header not in {"true", "false"}:
                raise PaperSyncError("paper state backend returned an invalid replay acknowledgement")
            replayed = replay_header == "true"
            expected_keys = {"ok", "source", "idempotency_key", "generated_at"}
            if (
                not isinstance(body, dict)
                or set(body) != expected_keys
                or body.get("ok") is not True
                or body.get("source") != "mosaic-murmurs-paper-engine"
                or body.get("idempotency_key") != idempotency_key
                or body.get("generated_at") != state["generated_at"]
                or not 200 <= status_code < 300
            ):
                raise PaperSyncError("paper state backend returned an invalid acknowledgement")
            return {
                "ok": True,
                "status": status_code,
                "replayed": replayed,
                "source": "mosaic-murmurs-paper-engine",
                "idempotency_key": idempotency_key,
                "generated_at": state["generated_at"],
            }
    except HTTPError as exc:
        raise PaperSyncError(f"paper state backend rejected the snapshot with HTTP {exc.code}") from exc
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as exc:
        raise PaperSyncError("paper state backend returned an invalid response") from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise PaperSyncError(f"paper state backend is unavailable: {type(exc).__name__}") from exc
