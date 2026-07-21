#!/usr/bin/env python3
"""Deterministic autonomous paper-only portfolio engine for Mosaic & Murmurs."""

from __future__ import annotations

import copy
import hashlib
import math
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlsplit

SCHEMA_VERSION = 4
INITIAL_BANK_CAPITAL = 1_000.0
INITIAL_INVESTMENT_CAPITAL = 1_000.0
ADDITIONAL_INVESTMENT_CAPITAL = INITIAL_INVESTMENT_CAPITAL  # Backward-compatible field name.
TOTAL_STARTING_BALANCE = INITIAL_BANK_CAPITAL + INITIAL_INVESTMENT_CAPITAL
CRASH_EQUITY_THRESHOLD = 0.01
FAST_MARK_MAX_AGE_HOURS = 2.0
EQUITY_MARK_MAX_AGE_HOURS = 96.0
LEGACY_BOOK_IDS = ["prediction_markets", "crypto", "equity_watch", "local_event_watch", "ai_cyber_watch"]
INSTRUMENT_TYPES = {"crypto", "equity", "prediction_market"}
IDEMPOTENCY_KEY_RE = re.compile(r"^[A-Za-z0-9._:~-]{1,200}$")
COST_MODEL_VERSION = "bss.execution_costs.v1"
COST_ASSUMPTION_SOURCE = "bss_tradesight_research_v1"
COST_BPS_FIELDS = ("fee_bps", "half_spread_bps", "slippage_bps", "market_impact_bps", "latency_bps")
DEFAULT_EXECUTION_COSTS: dict[str, dict[str, float]] = {
    # Conservative paper assumptions. Explicit adapter/broker schedules may override
    # each field, but malformed overrides fail closed rather than becoming free fills.
    "crypto": {"fee_bps": 20.0, "half_spread_bps": 10.0, "slippage_bps": 10.0, "market_impact_bps": 5.0, "latency_bps": 5.0},
    "equity": {"fee_bps": 0.0, "half_spread_bps": 2.0, "slippage_bps": 5.0, "market_impact_bps": 2.0, "latency_bps": 1.0},
    "prediction_market": {"fee_bps": 0.0, "half_spread_bps": 25.0, "slippage_bps": 10.0, "market_impact_bps": 5.0, "latency_bps": 10.0},
}

AGGRESSION_PROFILES: list[dict[str, Any]] = [
    {
        "line_id": "standard",
        "display_name": "Standard",
        "target_gross_fraction": 0.80,
        "max_position_fraction": 0.40,
        "target_position_count": 3,
        "minimum_order_notional": 40.0,
        "maximum_order_notional": 2_000.0,
    },
    {
        "line_id": "aggressive",
        "display_name": "Aggressive",
        "target_gross_fraction": 0.95,
        "max_position_fraction": 0.65,
        "target_position_count": 2,
        "minimum_order_notional": 20.0,
        "maximum_order_notional": 2_000.0,
    },
    {
        "line_id": "hyper_aggressive",
        "display_name": "Hyper-Aggressive",
        "target_gross_fraction": 1.0,
        "max_position_fraction": 1.0,
        "target_position_count": 1,
        "minimum_order_notional": 5.0,
        "maximum_order_notional": 2_000.0,
    },
]
PROFILE_BY_ID = {profile["line_id"]: profile for profile in AGGRESSION_PROFILES}

STRATEGY_SPECS: list[dict[str, Any]] = [
    {
        "strategy_id": "prediction_markets",
        "display_name": "Prediction Markets",
        "loop_affinity": "bridge",
        "instrument_type": "prediction_market",
        "selection_mode": "prediction_edge",
        "strategy": "Concentrated probability-edge rotation across liquid binary markets.",
        "seed_symbols": [],
    },
    {
        "strategy_id": "crypto",
        "display_name": "Crypto Momentum",
        "loop_affinity": "bridge",
        "instrument_type": "crypto",
        "selection_mode": "momentum",
        "strategy": "Persistent liquid-crypto momentum rotation; weak tape changes holdings rather than forcing cash.",
        "seed_symbols": ["BTC", "ETH", "SOL"],
    },
    {
        "strategy_id": "equity_watch",
        "display_name": "Index Momentum",
        "loop_affinity": "mosaic",
        "instrument_type": "equity",
        "selection_mode": "momentum",
        "strategy": "Broad-index and Microsoft momentum rotation through liquid public equities.",
        "seed_symbols": ["SPY", "QQQ", "MSFT"],
    },
    {
        "strategy_id": "local_event_watch",
        "display_name": "PNW Event Basket",
        "loop_affinity": "mosaic",
        "instrument_type": "equity",
        "selection_mode": "momentum",
        "strategy": "Seattle/Redmond/PNW economic proxy rotation with local-event overlays.",
        "seed_symbols": ["MSFT", "AMZN", "COST", "SBUX", "BA"],
    },
    {
        "strategy_id": "ai_cyber_watch",
        "display_name": "AI/Cyber Theme",
        "loop_affinity": "murmurs",
        "instrument_type": "equity",
        "selection_mode": "momentum",
        "strategy": "AI and cybersecurity thematic momentum across liquid ETFs.",
        "seed_symbols": ["HACK", "CIBR", "AIQ"],
    },
    {
        "strategy_id": "cross_asset_momentum",
        "display_name": "Cross-Asset Rotation",
        "loop_affinity": "bridge",
        "instrument_type": "cross_asset",
        "selection_mode": "momentum",
        "strategy": "Winner-take-more rotation across crypto and equity risk assets.",
        "seed_symbols": ["BTC", "QQQ", "AIQ"],
    },
    {
        "strategy_id": "contrarian_reversion",
        "display_name": "Contrarian Reversion",
        "loop_affinity": "murmurs",
        "instrument_type": "cross_asset",
        "selection_mode": "reversion",
        "strategy": "Deliberately catches the weakest liquid cross-asset marks to test mean reversion.",
        "seed_symbols": ["ETH", "AMZN", "CIBR"],
    },
    {
        "strategy_id": "volatility_barbell",
        "display_name": "Volatility Barbell",
        "loop_affinity": "mosaic",
        "instrument_type": "cross_asset",
        "selection_mode": "volatility_barbell",
        "strategy": "Rotates between the strongest and weakest high-beta proxies; concentration rises by line.",
        "seed_symbols": ["SPY", "SOL", "AIQ"],
    },
]
STRATEGY_BY_ID = {strategy["strategy_id"]: strategy for strategy in STRATEGY_SPECS}
STRATEGY_INSTRUMENT_TYPES = {
    "prediction_markets": {"prediction_market"},
    "crypto": {"crypto"},
    "equity_watch": {"equity"},
    "local_event_watch": {"equity"},
    "ai_cyber_watch": {"equity"},
    "cross_asset_momentum": {"crypto", "equity"},
    "contrarian_reversion": {"crypto", "equity"},
    "volatility_barbell": {"crypto", "equity"},
}

BOOK_SPECS: list[dict[str, Any]] = []
for profile in AGGRESSION_PROFILES:
    for strategy in STRATEGY_SPECS:
        BOOK_SPECS.append(
            {
                **strategy,
                **profile,
                "book_id": f"{profile['line_id']}__{strategy['strategy_id']}",
                "strategy_id": strategy["strategy_id"],
                "strategy_display_name": strategy["display_name"],
                "display_name": f"{profile['display_name']} / {strategy['display_name']}",
            }
        )
BOOK_IDS = [spec["book_id"] for spec in BOOK_SPECS]
BOOK_SPEC_BY_ID = {spec["book_id"]: spec for spec in BOOK_SPECS}
BOOK_DIMENSIONS = {
    "lines": [{"line_id": profile["line_id"], "display_name": profile["display_name"], "order": index} for index, profile in enumerate(AGGRESSION_PROFILES)],
    "strategies": [{"strategy_id": strategy["strategy_id"], "display_name": strategy["display_name"], "order": index} for index, strategy in enumerate(STRATEGY_SPECS)],
}


def iso_z(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_iso(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def to_float(value: Any, default: float = 0.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed == parsed and parsed not in {float("inf"), float("-inf")} else default


def money(value: Any) -> float:
    return round(to_float(value), 2)


def stable_id(prefix: str, *parts: Any) -> str:
    material = "\x1f".join(str(part or "") for part in parts)
    return f"{prefix}_{hashlib.sha256(material.encode('utf-8')).hexdigest()[:20]}"


def _new_book(spec: dict[str, Any], now: datetime) -> dict[str, Any]:
    stamp = iso_z(now)
    return {
        "book_id": spec["book_id"],
        "display_name": spec["display_name"],
        "line_id": spec["line_id"],
        "line_display_name": spec["display_name"].split(" / ", 1)[0],
        "strategy_id": spec["strategy_id"],
        "strategy_display_name": spec["strategy_display_name"],
        "aggression_profile": {
            "target_gross_fraction": spec["target_gross_fraction"],
            "max_position_fraction": spec["max_position_fraction"],
            "target_position_count": spec["target_position_count"],
            "minimum_order_notional": spec["minimum_order_notional"],
        },
        "loop_affinity": spec["loop_affinity"],
        "instrument_type": spec["instrument_type"],
        "strategy": spec["strategy"],
        "starting_balance": TOTAL_STARTING_BALANCE,
        "cash_balance": TOTAL_STARTING_BALANCE,
        "initial_bank_capital": INITIAL_BANK_CAPITAL,
        "initial_investment_capital": INITIAL_INVESTMENT_CAPITAL,
        "additional_capital_contribution": INITIAL_INVESTMENT_CAPITAL,
        "funding_migration_applied": True,
        "initial_allocation_complete": False,
        "initial_allocation_at": None,
        "positions": [],
        "realized_pnl": 0.0,
        "fees_paid": 0.0,
        "spread_costs": 0.0,
        "slippage_costs": 0.0,
        "market_impact_costs": 0.0,
        "latency_costs": 0.0,
        "transaction_costs": 0.0,
        "turnover_notional": 0.0,
        "equity": TOTAL_STARTING_BALANCE,
        "previous_equity": TOTAL_STARTING_BALANCE,
        "high_water_mark": TOTAL_STARTING_BALANCE,
        "max_drawdown_pct": 0.0,
        "last_trade_at": None,
        "last_decision_at": None,
        "status": "awaiting_initial_allocation",
        "postmortem_required": False,
        "crashed_at": None,
        "crash_reason": None,
        "created_at": stamp,
        "updated_at": stamp,
    }


def default_ledger(now: datetime | None = None) -> dict[str, Any]:
    current = now or datetime.now(timezone.utc)
    return {
        "schema_version": SCHEMA_VERSION,
        "currency": "USD",
        "paper_only": True,
        "autonomous_execution": True,
        "book_dimensions": copy.deepcopy(BOOK_DIMENSIONS),
        "updated_at": iso_z(current),
        "processed_idempotency_keys": [],
        "archived_books": [],
        "books": [_new_book(spec, current) for spec in BOOK_SPECS],
    }


def _strict_number(value: Any, label: str, *, minimum: float | None = None, maximum: float | None = None) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{label} must be a finite number")
    number = float(value)
    if minimum is not None and number < minimum:
        raise ValueError(f"{label} must be at least {minimum}")
    if maximum is not None and number > maximum:
        raise ValueError(f"{label} must be at most {maximum}")
    return number


def _migrated_nonnegative_amount(book: dict[str, Any], field: str) -> float:
    if field not in book:
        return 0.0
    return money(_strict_number(book[field], field, minimum=0.0))


def _valid_idempotency_key(value: Any) -> bool:
    return isinstance(value, str) and IDEMPOTENCY_KEY_RE.fullmatch(value) is not None


def _normalize_position(raw: dict[str, Any]) -> dict[str, Any]:
    position = dict(raw)
    entry_price = to_float(position.get("entry_price", position.get("basis")), 0.0)
    mark_price = to_float(position.get("mark_price", position.get("mark", entry_price)), entry_price)
    quantity = to_float(position.get("quantity"), 0.0)
    instrument_type = str(position.get("instrument_type") or "unknown")
    cost_basis = to_float(position.get("cost_basis"), quantity * entry_price) if instrument_type == "prediction_market" else quantity * entry_price
    position.update(
        {
            "position_id": str(position.get("position_id") or position.get("id") or stable_id("position", position.get("instrument_ref"))),
            "instrument_ref": str(position.get("instrument_ref") or position.get("asset_id") or position.get("symbol") or ""),
            "instrument_type": str(position.get("instrument_type") or "unknown"),
            "symbol": str(position.get("symbol") or ""),
            "title": str(position.get("title") or position.get("symbol") or position.get("instrument_ref") or "Unknown"),
            "quantity": round(quantity, 10),
            "entry_price": round(entry_price, 10),
            "mark_price": round(mark_price, 10),
            "previous_mark_price": round(to_float(position.get("previous_mark_price"), mark_price), 10),
            "cost_basis": money(cost_basis),
            "market_value": money(quantity * mark_price),
            "mark_status": str(position.get("mark_status") or "fresh"),
            "source_id": position.get("source_id"),
            "source_url": position.get("source_url"),
            "opened_at": position.get("opened_at"),
            "updated_at": position.get("updated_at"),
        }
    )
    return position


def migrate_ledger(raw: dict[str, Any] | None, now: datetime | None = None) -> dict[str, Any]:
    current = now or datetime.now(timezone.utc)
    if raw is None or raw == {}:
        source: dict[str, Any] = {}
        source_books: list[dict[str, Any]] = []
    else:
        if not isinstance(raw, dict):
            raise ValueError("ledger must be an object")
        source = copy.deepcopy(raw)
        schema_version = source.get("schema_version")
        if isinstance(schema_version, bool) or not isinstance(schema_version, int):
            raise ValueError("nonempty ledger requires an integer schema_version")
        raw_books = source.get("books")
        if not isinstance(raw_books, list) or not all(isinstance(book, dict) for book in raw_books):
            raise ValueError("ledger books must be an array of objects")
        source_books = list(raw_books)
        book_ids = [book.get("book_id") for book in source_books]
        if not all(isinstance(book_id, str) and book_id for book_id in book_ids):
            raise ValueError("every ledger book requires a book_id")
        if len(set(book_ids)) != len(book_ids):
            raise ValueError("ledger book_ids must be unique")
        if schema_version == 3:
            if set(book_ids) != set(LEGACY_BOOK_IDS) or len(book_ids) != len(LEGACY_BOOK_IDS):
                raise ValueError("schema-3 ledger must contain the exact legacy five-book set")
        elif schema_version == SCHEMA_VERSION:
            if set(book_ids) != set(BOOK_IDS) or len(book_ids) != len(BOOK_IDS):
                raise ValueError("schema-4 ledger must contain the exact canonical 24-book matrix")
        else:
            raise ValueError(f"unsupported ledger schema_version: {schema_version}")

    existing = {
        str(book["book_id"]): book
        for book in source_books
        if book.get("book_id") in BOOK_IDS
    }

    archived_books = [copy.deepcopy(book) for book in source.get("archived_books", []) if isinstance(book, dict)]
    archived_ids = {str(book.get("book_id") or book.get("id")) for book in archived_books}
    for old in source_books:
        old_id = str(old.get("book_id") or old.get("id") or "")
        if not old_id or old_id in BOOK_IDS or old_id in archived_ids:
            continue
        archived = copy.deepcopy(old)
        archived.update(
            {
                "book_id": old_id,
                "archived_at": archived.get("archived_at") or iso_z(current),
                "archive_reason": archived.get("archive_reason") or "superseded_by_3x8_strategy_matrix",
            }
        )
        archived_books.append(archived)
        archived_ids.add(old_id)

    books: list[dict[str, Any]] = []
    for spec in BOOK_SPECS:
        old = copy.deepcopy(existing.get(spec["book_id"], {}))
        if not old:
            books.append(_new_book(spec, current))
            continue

        if "cash_balance" not in old:
            raise ValueError(f"{spec['book_id']} is missing cash_balance")
        if isinstance(old["cash_balance"], (int, float)) and not isinstance(old["cash_balance"], bool) and old["cash_balance"] < 0:
            raise ValueError(f"{spec['book_id']} has negative cash and cannot be migrated safely")
        raw_cash_balance = _strict_number(old["cash_balance"], f"{spec['book_id']} cash_balance", minimum=0.0)
        raw_positions_value = old.get("positions")
        if not isinstance(raw_positions_value, list) or not all(isinstance(position, dict) for position in raw_positions_value):
            raise ValueError(f"{spec['book_id']} positions must be an array of objects")
        raw_positions: list[dict[str, Any]] = []
        for index, raw_position in enumerate(raw_positions_value):
            position = copy.deepcopy(raw_position)
            label = f"{spec['book_id']} position[{index}]"
            instrument_ref = position.get("instrument_ref")
            instrument_type = position.get("instrument_type")
            if not isinstance(instrument_ref, str) or not instrument_ref.strip():
                raise ValueError(f"{label} requires a nonempty instrument_ref")
            if instrument_type not in INSTRUMENT_TYPES:
                raise ValueError(f"{label} has an unsupported instrument_type")
            quantity = _strict_number(position.get("quantity"), f"{label} quantity", minimum=0.0)
            entry_price = _strict_number(position.get("entry_price"), f"{label} entry_price", minimum=0.0)
            mark_price = _strict_number(position.get("mark_price"), f"{label} mark_price", minimum=0.0)
            previous_mark = _strict_number(
                position.get("previous_mark_price", mark_price),
                f"{label} previous_mark_price",
                minimum=0.0,
            )
            if instrument_type == "prediction_market":
                if entry_price > 1.0 or mark_price > 1.0 or previous_mark > 1.0:
                    raise ValueError(f"{label} prediction-market prices must be in [0, 1]")
            elif entry_price <= 0.0 or mark_price <= 0.0 or previous_mark <= 0.0:
                raise ValueError(f"{label} non-prediction prices must be positive")
            position.update(
                instrument_ref=instrument_ref.strip(),
                quantity=quantity,
                entry_price=entry_price,
                mark_price=mark_price,
                previous_mark_price=previous_mark,
            )
            raw_positions.append(position)
        positions = [_normalize_position(position) for position in raw_positions]
        gross = money(sum(abs(position["market_value"]) for position in positions))
        cash_balance = money(raw_cash_balance)
        equity = money(cash_balance + gross)
        high_water = max(to_float(old.get("high_water_mark"), TOTAL_STARTING_BALANCE), TOTAL_STARTING_BALANCE, equity)
        initial_complete = bool(old.get("initial_allocation_complete")) or money(sum(position["cost_basis"] for position in positions)) >= INITIAL_INVESTMENT_CAPITAL - 0.01
        profile = PROFILE_BY_ID[spec["line_id"]]
        postmortem_required = bool(old.get("postmortem_required")) or str(old.get("status")) == "crashed"
        cost_counters = {
            field: _migrated_nonnegative_amount(old, field)
            for field in ("fees_paid", "spread_costs", "slippage_costs", "market_impact_costs", "latency_costs")
        }
        turnover_notional = _migrated_nonnegative_amount(old, "turnover_notional")
        component_total = money(sum(cost_counters.values()))
        transaction_costs = (
            _migrated_nonnegative_amount(old, "transaction_costs")
            if "transaction_costs" in old
            else component_total
        )
        if abs(transaction_costs - component_total) > 0.001:
            raise ValueError("transaction_costs must equal cumulative execution-cost components")
        book = {
            **old,
            "book_id": spec["book_id"],
            "display_name": spec["display_name"],
            "line_id": spec["line_id"],
            "line_display_name": profile["display_name"],
            "strategy_id": spec["strategy_id"],
            "strategy_display_name": spec["strategy_display_name"],
            "aggression_profile": {
                "target_gross_fraction": profile["target_gross_fraction"],
                "max_position_fraction": profile["max_position_fraction"],
                "target_position_count": profile["target_position_count"],
                "minimum_order_notional": profile["minimum_order_notional"],
            },
            "loop_affinity": spec["loop_affinity"],
            "instrument_type": spec["instrument_type"],
            "strategy": spec["strategy"],
            "starting_balance": TOTAL_STARTING_BALANCE,
            "cash_balance": cash_balance,
            "initial_bank_capital": INITIAL_BANK_CAPITAL,
            "initial_investment_capital": INITIAL_INVESTMENT_CAPITAL,
            "additional_capital_contribution": INITIAL_INVESTMENT_CAPITAL,
            "funding_migration_applied": True,
            "initial_allocation_complete": initial_complete,
            "initial_allocation_at": old.get("initial_allocation_at"),
            "positions": positions,
            "realized_pnl": money(old.get("realized_pnl", old.get("closed_pnl", 0.0))),
            **cost_counters,
            "transaction_costs": transaction_costs,
            "turnover_notional": turnover_notional,
            "equity": equity,
            "previous_equity": money(old.get("previous_equity", old.get("equity", equity))),
            "high_water_mark": money(high_water),
            "max_drawdown_pct": round(to_float(old.get("max_drawdown_pct")), 4),
            "last_trade_at": old.get("last_trade_at"),
            "last_decision_at": old.get("last_decision_at"),
            "status": "crashed" if postmortem_required else str(old.get("status") or ("active" if initial_complete else "awaiting_initial_allocation")),
            "postmortem_required": postmortem_required,
            "crashed_at": old.get("crashed_at"),
            "crash_reason": old.get("crash_reason"),
            "created_at": old.get("created_at") or iso_z(current),
            "updated_at": old.get("updated_at") or iso_z(current),
        }
        books.append(book)

    if source.get("schema_version") == SCHEMA_VERSION and "processed_idempotency_keys" not in source:
        raise ValueError("schema-4 ledger is missing processed_idempotency_keys")
    processed_keys = source.get("processed_idempotency_keys", [])
    if not isinstance(processed_keys, list) or not all(_valid_idempotency_key(key) for key in processed_keys):
        raise ValueError("processed_idempotency_keys must be an array of header-safe strings")
    if len(set(processed_keys)) != len(processed_keys):
        raise ValueError("processed_idempotency_keys must be unique")

    return {
        **source,
        "schema_version": SCHEMA_VERSION,
        "currency": str(source.get("currency") or "USD"),
        "paper_only": True,
        "autonomous_execution": True,
        "book_dimensions": copy.deepcopy(BOOK_DIMENSIONS),
        "updated_at": source.get("updated_at") or iso_z(current),
        "processed_idempotency_keys": list(processed_keys),
        "archived_books": archived_books,
        "books": books,
    }


def _market_value(position: dict[str, Any]) -> float:
    return money(to_float(position.get("quantity")) * to_float(position.get("mark_price")))


def summarize_book(book: dict[str, Any]) -> dict[str, Any]:
    positions = [position for position in book.get("positions", []) if to_float(position.get("quantity")) > 0]
    gross = money(sum(abs(_market_value(position)) for position in positions))
    cash = money(book.get("cash_balance"))
    equity = money(cash + gross)
    starting = money(book.get("starting_balance", TOTAL_STARTING_BALANCE))
    previous_equity = money(book.get("previous_equity", starting))
    unrealized = money(
        sum(
            to_float(position.get("quantity"))
            * (to_float(position.get("mark_price")) - to_float(position.get("entry_price")))
            for position in positions
        )
    )
    realized = money(book.get("realized_pnl"))
    cumulative = money(equity - starting)
    daily = money(equity - previous_equity)
    high_water = max(to_float(book.get("high_water_mark"), starting), equity, starting)
    drawdown = ((high_water - equity) / high_water * 100.0) if high_water else 0.0
    stale = sum(1 for position in positions if position.get("mark_status") != "fresh")
    status = "stale" if stale else "up" if cumulative > 0 else "down" if cumulative < 0 else "flat"
    if book.get("postmortem_required") or book.get("status") == "crashed":
        status = "crashed"
    elif not book.get("initial_allocation_complete"):
        status = "awaiting_initial_allocation" if not stale else "stale"
    return {
        "book_id": book["book_id"],
        "display_name": book["display_name"],
        "line_id": book.get("line_id"),
        "line_display_name": book.get("line_display_name"),
        "strategy_id": book.get("strategy_id"),
        "strategy_display_name": book.get("strategy_display_name"),
        "aggression_profile": copy.deepcopy(book.get("aggression_profile") or {}),
        "starting_balance": starting,
        "cash_balance": cash,
        "equity": equity,
        "open_position_count": len(positions),
        "gross_paper_exposure": gross,
        "daily_pnl": daily,
        "daily_pnl_pct": round((daily / previous_equity * 100.0) if previous_equity else 0.0, 4),
        "realized_pnl": realized,
        "fees_paid": money(book.get("fees_paid")),
        "spread_costs": money(book.get("spread_costs")),
        "slippage_costs": money(book.get("slippage_costs")),
        "market_impact_costs": money(book.get("market_impact_costs")),
        "latency_costs": money(book.get("latency_costs")),
        "transaction_costs": money(book.get("transaction_costs")),
        "turnover_notional": money(book.get("turnover_notional")),
        "unrealized_pnl": unrealized,
        "cumulative_pnl": cumulative,
        "cumulative_pnl_pct": round((cumulative / starting * 100.0) if starting else 0.0, 4),
        "drawdown_pct": round(drawdown, 4),
        "max_drawdown_pct": round(max(to_float(book.get("max_drawdown_pct")), drawdown), 4),
        "stale_open_marks": stale,
        "status": status,
        "postmortem_required": bool(book.get("postmortem_required")),
        "crashed_at": book.get("crashed_at"),
    }


def _age_hours(value: Any, now: datetime) -> float | None:
    parsed = parse_iso(value)
    if parsed is None:
        return None
    return (now - parsed).total_seconds() / 3600.0


def instrument_fresh(instrument: dict[str, Any], now: datetime) -> tuple[bool, str]:
    instrument_ref = instrument.get("instrument_ref")
    instrument_type = instrument.get("instrument_type")
    source_id = instrument.get("source_id")
    source_url = instrument.get("source_url")
    if not isinstance(instrument_ref, str) or not instrument_ref.strip():
        return False, "missing instrument reference"
    if instrument_type not in INSTRUMENT_TYPES:
        return False, "unsupported instrument type"
    if not isinstance(source_id, str) or not source_id.strip():
        return False, "missing source provenance"
    if not isinstance(source_url, str):
        return False, "missing source provenance"
    parsed_source_url = urlsplit(source_url)
    if parsed_source_url.scheme != "https" or not parsed_source_url.hostname or parsed_source_url.username or parsed_source_url.password:
        return False, "invalid source URL"
    raw_mark = instrument.get("mark_price")
    if isinstance(raw_mark, bool) or not isinstance(raw_mark, (int, float)) or not math.isfinite(raw_mark):
        return False, "missing or invalid mark"
    mark = float(raw_mark)
    settled = instrument.get("settled", False)
    if not isinstance(settled, bool):
        return False, "settled flag must be boolean"
    if settled and instrument_type != "prediction_market":
        return False, "only prediction markets can carry terminal settlement"
    if instrument_type == "prediction_market":
        if mark < 0.0 or mark > 1.0:
            return False, "prediction mark outside [0, 1]"
        if settled and mark not in {0.0, 1.0}:
            return False, "explicit settlement requires a terminal prediction mark"
        if mark in {0.0, 1.0} and not settled:
            return False, "terminal prediction mark lacks explicit settlement"
    elif mark <= 0.0:
        return False, "non-prediction mark must be positive"
    retrieved_age = _age_hours(instrument.get("retrieved_at"), now)
    if retrieved_age is None or retrieved_age < 0.0 or retrieved_age > FAST_MARK_MAX_AGE_HOURS:
        return False, "stale or future retrieval"
    market_age = _age_hours(instrument.get("as_of"), now)
    max_market_age = EQUITY_MARK_MAX_AGE_HOURS if instrument_type == "equity" else FAST_MARK_MAX_AGE_HOURS
    if market_age is None or market_age < 0.0 or (not settled and market_age > max_market_age):
        return False, "stale or future market mark"
    try:
        execution_cost_model(instrument)
    except ValueError as exc:
        return False, f"invalid execution-cost model: {exc}"
    return True, "fresh mark"


def _snapshot_index(snapshot: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        str(item.get("instrument_ref")): copy.deepcopy(item)
        for item in snapshot.get("instruments", [])
        if isinstance(item, dict) and item.get("instrument_ref")
    }


def _mark_book(book: dict[str, Any], instruments: dict[str, dict[str, Any]], now: datetime) -> None:
    for position in book.get("positions", []):
        current = instruments.get(position["instrument_ref"])
        identity_matches = (
            isinstance(current, dict)
            and current.get("instrument_type") == position.get("instrument_type")
            and (not position.get("symbol") or not current.get("symbol") or str(position["symbol"]).upper() == str(current["symbol"]).upper())
        )
        fresh, _ = instrument_fresh(current or {}, now) if identity_matches else (False, "instrument identity mismatch")
        position["previous_mark_price"] = to_float(position.get("mark_price"), position.get("entry_price", 0.0))
        if fresh and current is not None:
            position["mark_price"] = round(to_float(current.get("mark_price")), 10)
            position["market_value"] = _market_value(position)
            position["mark_status"] = "fresh"
            position["source_id"] = current.get("source_id")
            position["source_url"] = current.get("source_url")
            position["updated_at"] = iso_z(now)
        else:
            position["mark_status"] = "stale"


def _eligible_for_strategy(book: dict[str, Any], instrument: dict[str, Any]) -> bool:
    strategy_id = book["strategy_id"]
    tags = instrument.get("book_tags")
    return (
        instrument.get("settled") is not True
        and isinstance(tags, list)
        and all(isinstance(tag, str) for tag in tags)
        and strategy_id in tags
        and instrument.get("instrument_type") in STRATEGY_INSTRUMENT_TYPES[strategy_id]
    )


def _seed_instruments(book: dict[str, Any], instruments: dict[str, dict[str, Any]], now: datetime) -> tuple[list[dict[str, Any]], list[str]]:
    spec = STRATEGY_BY_ID[book["strategy_id"]]
    if book["strategy_id"] == "prediction_markets":
        by_market: dict[str, list[dict[str, Any]]] = {}
        for item in instruments.values():
            if _eligible_for_strategy(book, item) and item.get("market_id"):
                by_market.setdefault(str(item["market_id"]), []).append(item)
        eligible: list[tuple[float, list[dict[str, Any]]]] = []
        for outcomes in by_market.values():
            names = {str(item.get("outcome") or item.get("symbol")).upper() for item in outcomes}
            freshness = [instrument_fresh(item, now)[0] for item in outcomes]
            if {"YES", "NO"}.issubset(names) and all(freshness):
                eligible.append((max(to_float(item.get("liquidity")) for item in outcomes), outcomes))
        if not eligible:
            return [], ["stale or missing seed marks: eligible binary prediction market"]
        outcomes = max(eligible, key=lambda entry: entry[0])[1]
        selected = [next(item for item in outcomes if str(item.get("outcome") or item.get("symbol")).upper() == name) for name in ("YES", "NO")]
        return selected, []

    selected: list[dict[str, Any]] = []
    errors: list[str] = []
    for symbol in spec["seed_symbols"]:
        item = next(
            (
                candidate
                for candidate in instruments.values()
                if str(candidate.get("symbol") or "").upper() == symbol
                and _eligible_for_strategy(book, candidate)
            ),
            None,
        )
        fresh, reason = instrument_fresh(item or {}, now)
        if not item or not fresh:
            errors.append(f"stale or missing seed marks: {symbol} ({reason})")
        else:
            selected.append(item)
    return selected, errors


def _split_notional(total: float, count: int) -> list[float]:
    if count <= 0:
        return []
    base_cents = int(round(total * 100)) // count
    cents = [base_cents] * count
    for index in range(int(round(total * 100)) - base_cents * count):
        cents[index] += 1
    return [value / 100.0 for value in cents]


def _decision(
    *,
    run_key: str,
    book: dict[str, Any],
    action: str,
    status: str,
    now: datetime,
    instrument: dict[str, Any] | None,
    paper_size: float,
    checks: list[str],
    risk_passed: bool,
    reason: str,
    human_review_required: bool = False,
) -> dict[str, Any]:
    instrument_ref = str((instrument or {}).get("instrument_ref") or f"paper_book:{book['book_id']}")
    decision_id = stable_id("decision", run_key, book["book_id"], action, instrument_ref)
    return {
        "candidate_id": decision_id,
        "decision_id": decision_id,
        "idempotency_key": stable_id("idem", run_key, book["book_id"], action, instrument_ref),
        "book_id": book["book_id"],
        "action": action,
        "status": status,
        "instrument_ref": instrument_ref,
        "instrument_type": (instrument or {}).get("instrument_type") or book["instrument_type"],
        "symbol": (instrument or {}).get("symbol"),
        "paper_size": money(paper_size),
        "mark_price": round(to_float((instrument or {}).get("mark_price")), 10) or None,
        "thesis": reason,
        "risk_policy_checks": checks,
        "risk_policy_passed": risk_passed,
        "paper_only": True,
        "autonomous_execution": risk_passed and action in {"PAPER_BUY", "PAPER_SELL"},
        "human_review_required": human_review_required,
        "review_required": human_review_required,
        "generated_at": iso_z(now),
        "source_ref": (instrument or {}).get("source_id"),
        "source_url": (instrument or {}).get("source_url"),
    }


def _position_for(book: dict[str, Any], instrument_ref: str) -> dict[str, Any] | None:
    return next((position for position in book.get("positions", []) if position.get("instrument_ref") == instrument_ref), None)


def execution_cost_model(instrument: dict[str, Any]) -> dict[str, Any]:
    instrument_type = instrument.get("instrument_type")
    defaults = DEFAULT_EXECUTION_COSTS.get(str(instrument_type))
    if defaults is None:
        raise ValueError(f"unsupported execution-cost instrument type: {instrument_type}")
    model: dict[str, Any] = {"model_version": COST_MODEL_VERSION, "assumption_source": COST_ASSUMPTION_SOURCE}
    for field in COST_BPS_FIELDS:
        if field in instrument:
            value = instrument[field]
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0 or value > 1_000:
                raise ValueError(f"{field} must be a finite numeric bps value in [0, 1000]")
            model[field] = float(value)
        else:
            model[field] = defaults[field]
    return model


def estimate_round_trip_cost_bps(instrument: dict[str, Any]) -> float:
    model = execution_cost_model(instrument)
    return round(2.0 * sum(model[field] for field in COST_BPS_FIELDS), 6)


def _execution_breakdown(instrument: dict[str, Any], reference_price: float, gross_notional: float, side: str) -> dict[str, Any]:
    model = execution_cost_model(instrument)
    adverse_fields = ("half_spread_bps", "slippage_bps", "market_impact_bps", "latency_bps")
    adverse_bps = sum(model[field] for field in adverse_fields)
    if instrument.get("instrument_type") == "prediction_market":
        # A binary contract is bounded in [0, 1]. Friction is a separate cash cost,
        # never a synthetic contract price above one or below zero.
        execution_price = reference_price
        reference_notional = gross_notional
        price_impact_total = gross_notional * adverse_bps / 10_000.0
    else:
        multiplier = 1.0 + adverse_bps / 10_000.0 if side == "buy" else max(0.0, 1.0 - adverse_bps / 10_000.0)
        execution_price = reference_price * multiplier
        reference_notional = gross_notional / multiplier if multiplier > 0 else 0.0
        price_impact_total = abs(gross_notional - reference_notional)
    fee_amount = gross_notional * model["fee_bps"] / 10_000.0
    component_total_bps = sum(model[field] for field in adverse_fields)

    def component_cost(field: str) -> float:
        return 0.0 if component_total_bps <= 0 else price_impact_total * model[field] / component_total_bps

    costs = {
        "cost_model_version": model["model_version"],
        "cost_assumption_source": model["assumption_source"],
        "reference_price": round(reference_price, 10),
        "execution_price": round(execution_price, 10),
        "gross_notional": money(gross_notional),
        "fee_amount": money(fee_amount),
        "spread_cost": money(component_cost("half_spread_bps")),
        "slippage_cost": money(component_cost("slippage_bps")),
        "market_impact_cost": money(component_cost("market_impact_bps")),
        "latency_cost": money(component_cost("latency_bps")),
    }
    costs["total_transaction_cost"] = money(
        costs["fee_amount"] + costs["spread_cost"] + costs["slippage_cost"] + costs["market_impact_cost"] + costs["latency_cost"]
    )
    return costs


def _record_execution_costs(book: dict[str, Any], costs: dict[str, Any]) -> None:
    book["fees_paid"] = money(to_float(book.get("fees_paid")) + costs["fee_amount"])
    book["spread_costs"] = money(to_float(book.get("spread_costs")) + costs["spread_cost"])
    book["slippage_costs"] = money(to_float(book.get("slippage_costs")) + costs["slippage_cost"])
    book["market_impact_costs"] = money(to_float(book.get("market_impact_costs")) + costs["market_impact_cost"])
    book["latency_costs"] = money(to_float(book.get("latency_costs")) + costs["latency_cost"])
    book["transaction_costs"] = money(to_float(book.get("transaction_costs")) + costs["total_transaction_cost"])
    book["turnover_notional"] = money(to_float(book.get("turnover_notional")) + costs["gross_notional"])


def _execute_buy(book: dict[str, Any], instrument: dict[str, Any], notional: float, decision: dict[str, Any], now: datetime) -> dict[str, Any]:
    before_cash = money(book["cash_balance"])
    mark = to_float(instrument["mark_price"])
    prediction_market = instrument.get("instrument_type") == "prediction_market"
    model = execution_cost_model(instrument)
    adverse_bps = sum(model[field] for field in COST_BPS_FIELDS if field != "fee_bps")
    gross_notional = notional if prediction_market else notional * (1.0 + adverse_bps / 10_000.0)
    costs = _execution_breakdown(instrument, mark, gross_notional, "buy")
    execution_price = costs["execution_price"]
    quantity = gross_notional / execution_price
    total_outlay = money(gross_notional + (costs["total_transaction_cost"] if prediction_market else costs["fee_amount"]))
    existing = _position_for(book, instrument["instrument_ref"])
    before_quantity = to_float((existing or {}).get("quantity"))
    if existing:
        old_cost = to_float(existing.get("cost_basis"), before_quantity * to_float(existing.get("entry_price")))
        new_quantity = before_quantity + quantity
        existing["quantity"] = round(new_quantity, 10)
        existing["cost_basis"] = money(old_cost + total_outlay)
        if prediction_market:
            old_reference_notional = before_quantity * to_float(existing.get("entry_price"))
            existing["entry_price"] = round((old_reference_notional + quantity * mark) / new_quantity, 10)
        else:
            existing["entry_price"] = round((old_cost + total_outlay) / new_quantity, 10)
        existing["previous_mark_price"] = to_float(existing.get("mark_price"), mark)
        existing["mark_price"] = round(mark, 10)
        existing["market_value"] = money(new_quantity * mark)
        existing["mark_status"] = "fresh"
        existing["updated_at"] = iso_z(now)
        position = existing
    else:
        position = {
            "position_id": stable_id("position", book["book_id"], instrument["instrument_ref"]),
            "instrument_ref": instrument["instrument_ref"],
            "instrument_type": instrument["instrument_type"],
            "symbol": instrument.get("symbol"),
            "title": instrument.get("title") or instrument.get("symbol") or instrument["instrument_ref"],
            "quantity": round(quantity, 10),
            "entry_price": round(mark if prediction_market else total_outlay / quantity, 10),
            "mark_price": round(mark, 10),
            "previous_mark_price": round(mark, 10),
            "cost_basis": total_outlay,
            "market_value": money(quantity * mark),
            "mark_status": "fresh",
            "source_id": instrument.get("source_id"),
            "source_url": instrument.get("source_url"),
            "opened_at": iso_z(now),
            "updated_at": iso_z(now),
        }
        book.setdefault("positions", []).append(position)
    book["cash_balance"] = money(before_cash - total_outlay)
    _record_execution_costs(book, costs)
    book["last_trade_at"] = iso_z(now)
    return {
        "event_id": stable_id("event", decision["decision_id"], "fill"),
        "decision_id": decision["decision_id"],
        "idempotency_key": decision["idempotency_key"],
        "book_id": book["book_id"],
        "event_type": "paper_fill",
        "action": "PAPER_BUY",
        "instrument_ref": instrument["instrument_ref"],
        "quantity": round(quantity, 10),
        "mark_price": round(mark, 10),
        "paper_size": money(notional),
        "realized_pnl": 0.0,
        "cash_before": before_cash,
        "cash_after": book["cash_balance"],
        "position_quantity_before": round(before_quantity, 10),
        "position_quantity_after": position["quantity"],
        "generated_at": iso_z(now),
        "paper_only": True,
        "autonomous_execution": True,
        **costs,
    }


def _execute_sell(
    book: dict[str, Any],
    instrument: dict[str, Any],
    notional: float,
    decision: dict[str, Any],
    now: datetime,
    *,
    terminal_settlement: bool = False,
) -> dict[str, Any] | None:
    position = _position_for(book, instrument["instrument_ref"])
    if position is None:
        return None
    mark = to_float(instrument["mark_price"])
    held_quantity = to_float(position.get("quantity"))
    held_market_value = held_quantity * mark
    sell_quantity = held_quantity if terminal_settlement or notional >= held_market_value - 0.01 else min(held_quantity, notional / mark)
    if sell_quantity <= 0:
        return None
    before_cash = money(book["cash_balance"])
    prediction_market = instrument.get("instrument_type") == "prediction_market"
    if terminal_settlement:
        execution_price = mark
        proceeds = sell_quantity * execution_price
        costs = {
            "cost_model_version": COST_MODEL_VERSION,
            "cost_assumption_source": COST_ASSUMPTION_SOURCE,
            "reference_price": round(mark, 10),
            "execution_price": round(mark, 10),
            "gross_notional": money(proceeds),
            "fee_amount": 0.0,
            "spread_cost": 0.0,
            "slippage_cost": 0.0,
            "market_impact_cost": 0.0,
            "latency_cost": 0.0,
            "total_transaction_cost": 0.0,
        }
    elif prediction_market:
        execution_price = mark
        proceeds = sell_quantity * execution_price
        costs = _execution_breakdown(instrument, mark, proceeds, "sell")
    else:
        model = execution_cost_model(instrument)
        adverse_bps = sum(model[field] for field in COST_BPS_FIELDS if field != "fee_bps")
        execution_price = mark * max(0.0, 1.0 - adverse_bps / 10_000.0)
        proceeds = sell_quantity * execution_price
        costs = _execution_breakdown(instrument, mark, proceeds, "sell")
    net_proceeds = money(proceeds - (costs["total_transaction_cost"] if prediction_market and not terminal_settlement else costs["fee_amount"]))
    position_cost_basis = to_float(position.get("cost_basis"), held_quantity * to_float(position.get("entry_price")))
    basis_cost = position_cost_basis * sell_quantity / held_quantity if prediction_market and held_quantity > 0 else sell_quantity * to_float(position.get("entry_price"))
    remaining = max(0.0, held_quantity - sell_quantity)
    book["cash_balance"] = money(before_cash + net_proceeds)
    realized_pnl = money(net_proceeds - basis_cost)
    book["realized_pnl"] = money(to_float(book.get("realized_pnl")) + realized_pnl)
    if not terminal_settlement:
        _record_execution_costs(book, costs)
    if remaining <= 0.00000001:
        book["positions"] = [entry for entry in book.get("positions", []) if entry is not position]
    else:
        position["quantity"] = round(remaining, 10)
        position["cost_basis"] = money(position_cost_basis * remaining / held_quantity) if prediction_market and held_quantity > 0 else money(remaining * to_float(position.get("entry_price")))
        position["mark_price"] = round(mark, 10)
        position["market_value"] = money(remaining * mark)
        position["updated_at"] = iso_z(now)
    book["last_trade_at"] = iso_z(now)
    return {
        "event_id": stable_id("event", decision["decision_id"], "fill"),
        "decision_id": decision["decision_id"],
        "idempotency_key": decision["idempotency_key"],
        "book_id": book["book_id"],
        "event_type": "paper_fill",
        "action": "PAPER_SELL",
        "instrument_ref": instrument["instrument_ref"],
        "quantity": round(sell_quantity, 10),
        "mark_price": round(mark, 10),
        "paper_size": money(sell_quantity * mark),
        "realized_pnl": realized_pnl,
        "cash_before": before_cash,
        "cash_after": book["cash_balance"],
        "position_quantity_before": round(held_quantity, 10),
        "position_quantity_after": round(remaining, 10),
        "generated_at": iso_z(now),
        "paper_only": True,
        "autonomous_execution": True,
        **costs,
    }


def _settle_terminal_positions(
    book: dict[str, Any],
    instruments: dict[str, dict[str, Any]],
    now: datetime,
    run_key: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    decisions: list[dict[str, Any]] = []
    events: list[dict[str, Any]] = []
    if book.get("status") == "crashed" or book.get("postmortem_required") is True:
        return decisions, events
    for position in list(book.get("positions", [])):
        quote = instruments.get(position.get("instrument_ref"))
        if (
            not isinstance(quote, dict)
            or quote.get("instrument_type") != "prediction_market"
            or position.get("instrument_type") != "prediction_market"
            or quote.get("settled") is not True
            or not instrument_fresh(quote, now)[0]
        ):
            continue
        mark = float(quote["mark_price"])
        notional = to_float(position.get("quantity")) * mark
        decision = _decision(
            book=book,
            run_key=run_key,
            action="PAPER_SELL",
            status="paper_settled",
            now=now,
            instrument=quote,
            paper_size=notional,
            checks=["paper_only", "explicit terminal settlement", "fresh retrieval", "no real-money execution"],
            risk_passed=True,
            reason="Close the held prediction-market outcome at its explicit terminal settlement mark.",
        )
        fill = _execute_sell(book, quote, notional, decision, now, terminal_settlement=True)
        if fill is not None:
            decisions.append(decision)
            events.append(fill)
    return decisions, events


def _risk_checks(
    book: dict[str, Any],
    action: str,
    notional: float,
    instrument: dict[str, Any],
    now: datetime,
    *,
    enforce_cooldown: bool = True,
) -> tuple[bool, list[str]]:
    del enforce_cooldown  # Turnover is governed by profile thresholds, not a cash-producing cooldown.
    profile = PROFILE_BY_ID[book["line_id"]]
    checks = [
        "paper_only",
        "fresh mark",
        "idempotent decision",
        "no real-money execution",
        "no leverage",
        f"aggression profile: {book['line_id']}",
    ]
    fresh, freshness_reason = instrument_fresh(instrument, now)
    if not fresh:
        checks.append(f"stale mark blocked: {freshness_reason}")
        return False, checks
    try:
        cost_model = execution_cost_model(instrument)
    except ValueError as exc:
        checks.append(f"invalid execution-cost model blocked: {exc}")
        return False, checks
    checks.append(f"execution costs: {COST_MODEL_VERSION}")
    if action == "PAPER_BUY" and to_float(instrument.get("mark_price"), 0.0) <= 0:
        checks.append("non-positive marks cannot be bought")
        return False, checks
    if notional > profile["maximum_order_notional"] + 0.01:
        checks.append("order notional exceeds profile maximum")
        return False, checks
    adverse_bps = sum(cost_model[field] for field in COST_BPS_FIELDS if field != "fee_bps")
    required_cash = notional * (1.0 + adverse_bps / 10_000.0) * (1.0 + cost_model["fee_bps"] / 10_000.0)
    if action == "PAPER_BUY" and to_float(book.get("cash_balance")) + 0.001 < required_cash:
        checks.append("insufficient cash")
        return False, checks
    if book.get("postmortem_required") or book.get("status") == "crashed":
        checks.append("crashed books are terminal pending postmortem")
        return False, checks
    checks.append("risk policy passed")
    return True, checks


def _seed_book(book: dict[str, Any], instruments: dict[str, dict[str, Any]], now: datetime, run_key: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    deployed_cost_basis = money(sum(to_float(position.get("cost_basis")) for position in book.get("positions", [])))
    remaining_seed_notional = money(max(0.0, INITIAL_INVESTMENT_CAPITAL - deployed_cost_basis))
    if remaining_seed_notional <= 0.01:
        book["initial_allocation_complete"] = True
        book["initial_allocation_at"] = book.get("initial_allocation_at") or iso_z(now)
        book["status"] = "active"
        return [], []
    selected, errors = _seed_instruments(book, instruments, now)
    if errors:
        return [
            _decision(
                run_key=run_key,
                book=book,
                action="AVOID",
                status="blocked",
                now=now,
                instrument=None,
                paper_size=0.0,
                checks=errors,
                risk_passed=False,
                reason="Initial allocation blocked because required market marks are stale or missing.",
            )
        ], []

    notionals = _split_notional(remaining_seed_notional, len(selected))
    decisions: list[dict[str, Any]] = []
    events: list[dict[str, Any]] = []
    for instrument, notional in zip(selected, notionals):
        passed, checks = _risk_checks(book, "PAPER_BUY", notional, instrument, now, enforce_cooldown=False)
        decision = _decision(
            run_key=run_key,
            book=book,
            action="PAPER_BUY" if passed else "AVOID",
            status="paper_filled" if passed else "blocked",
            now=now,
            instrument=instrument,
            paper_size=notional if passed else 0.0,
            checks=checks,
            risk_passed=passed,
            reason="Required initial paper allocation from the additional capital contribution.",
        )
        decisions.append(decision)
        if passed:
            events.append(_execute_buy(book, instrument, notional, decision, now))
    book["initial_allocation_complete"] = money(sum(to_float(position.get("cost_basis")) for position in book.get("positions", []))) >= INITIAL_INVESTMENT_CAPITAL - 0.01
    if book["initial_allocation_complete"] and not book.get("initial_allocation_at"):
        book["initial_allocation_at"] = iso_z(now)
    book["status"] = "active" if book["initial_allocation_complete"] else "allocation_blocked"
    return decisions, events


def _instrument_score(instrument: dict[str, Any]) -> float:
    signal = to_float(instrument.get("signal_score"), 0.0)
    momentum = to_float(instrument.get("momentum_score"), 0.0)
    return signal if abs(signal) > 0.000001 else momentum


def _select_targets(book: dict[str, Any], eligible: list[dict[str, Any]]) -> list[dict[str, Any]]:
    profile = PROFILE_BY_ID[book["line_id"]]
    count = int(profile["target_position_count"])
    mode = STRATEGY_BY_ID[book["strategy_id"]]["selection_mode"]
    ordered: list[dict[str, Any]]
    if mode == "prediction_edge":
        by_market: dict[str, list[dict[str, Any]]] = {}
        for item in eligible:
            by_market.setdefault(str(item.get("market_id") or item["instrument_ref"]), []).append(item)
        picks = [
            max(
                by_market[market_id],
                key=lambda item: (
                    _instrument_score(item),
                    to_float(item.get("liquidity")),
                    to_float(item.get("mark_price")),
                    str(item.get("instrument_ref")),
                ),
            )
            for market_id in sorted(by_market)
        ]
        ordered = sorted(
            picks,
            key=lambda item: (_instrument_score(item), to_float(item.get("liquidity")), str(item.get("instrument_ref"))),
            reverse=True,
        )
        picked_refs = {item["instrument_ref"] for item in ordered}
        supplemental = sorted(
            (item for item in eligible if item["instrument_ref"] not in picked_refs),
            key=lambda item: (_instrument_score(item), to_float(item.get("liquidity")), str(item.get("instrument_ref"))),
            reverse=True,
        )
        ordered.extend(supplemental)
    elif mode == "reversion":
        ordered = sorted(eligible, key=lambda item: (_instrument_score(item), str(item.get("instrument_ref"))))
    elif mode == "volatility_barbell":
        ascending = sorted(eligible, key=lambda item: (_instrument_score(item), str(item.get("instrument_ref"))))
        ordered = []
        left, right = 0, len(ascending) - 1
        while left <= right:
            if right >= left:
                ordered.append(ascending[right])
                right -= 1
            if left <= right:
                ordered.append(ascending[left])
                left += 1
    else:
        ordered = sorted(eligible, key=lambda item: (_instrument_score(item), str(item.get("instrument_ref"))), reverse=True)
    return ordered[:count]


def _target_notionals(book: dict[str, Any], instruments: dict[str, dict[str, Any]], now: datetime) -> dict[str, float]:
    summary = summarize_book(book)
    current = {position["instrument_ref"]: _market_value(position) for position in book.get("positions", [])}
    if book.get("postmortem_required") or summary["equity"] <= CRASH_EQUITY_THRESHOLD:
        return current

    eligible = [
        item
        for item in instruments.values()
        if _eligible_for_strategy(book, item)
        and to_float(item.get("mark_price"), 0.0) > 0
        and instrument_fresh(item, now)[0]
    ]
    if not eligible:
        return current

    selected = _select_targets(book, eligible)
    if not selected:
        return current

    profile = PROFILE_BY_ID[book["line_id"]]
    gross_target = money(summary["equity"] * profile["target_gross_fraction"])
    per_instrument_cap = summary["equity"] * profile["max_position_fraction"]
    refs = sorted(set(current) | {item["instrument_ref"] for item in eligible})
    targets = {ref: 0.0 for ref in refs}
    remaining = gross_target
    for index, item in enumerate(selected):
        slots_left = len(selected) - index
        allocation = money(min(per_instrument_cap, remaining / slots_left))
        targets[item["instrument_ref"]] = allocation
        remaining = money(max(0.0, remaining - allocation))
    return targets


def _rebalance_book(book: dict[str, Any], instruments: dict[str, dict[str, Any]], now: datetime, run_key: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    targets = _target_notionals(book, instruments, now)
    profile = PROFILE_BY_ID[book["line_id"]]
    orders: list[tuple[str, dict[str, Any], float]] = []
    for instrument_ref, target in targets.items():
        instrument = instruments.get(instrument_ref)
        position = _position_for(book, instrument_ref)
        if instrument is None and position is not None:
            instrument = {
                "instrument_ref": instrument_ref,
                "instrument_type": position["instrument_type"],
                "symbol": position.get("symbol"),
                "title": position.get("title"),
                "mark_price": position.get("mark_price"),
                "retrieved_at": position.get("updated_at"),
                "as_of": position.get("updated_at"),
                "source_id": position.get("source_id"),
                "source_url": position.get("source_url"),
            }
        if instrument is None:
            continue
        current = _market_value(position) if position else 0.0
        delta = money(target - current)
        if abs(delta) < profile["minimum_order_notional"]:
            continue
        orders.append(("PAPER_SELL" if delta < 0 else "PAPER_BUY", instrument, min(abs(delta), profile["maximum_order_notional"])))

    # Free cash and reduce risk before evaluating buys.
    orders.sort(key=lambda entry: (0 if entry[0] == "PAPER_SELL" else 1, str(entry[1].get("instrument_ref"))))
    decisions: list[dict[str, Any]] = []
    events: list[dict[str, Any]] = []
    for action, instrument, notional in orders:
        if action == "PAPER_BUY":
            model = execution_cost_model(instrument)
            adverse_bps = sum(model[field] for field in COST_BPS_FIELDS if field != "fee_bps")
            cash_multiplier = (1.0 + adverse_bps / 10_000.0) * (1.0 + model["fee_bps"] / 10_000.0)
            affordable = math.floor((to_float(book.get("cash_balance")) / cash_multiplier) * 100.0) / 100.0
            notional = min(notional, affordable)
        passed, checks = _risk_checks(book, action, notional, instrument, now)
        decision = _decision(
            run_key=run_key,
            book=book,
            action=action if passed else "AVOID",
            status="paper_filled" if passed else "blocked",
            now=now,
            instrument=instrument,
            paper_size=notional if passed else 0.0,
            checks=checks,
            risk_passed=passed,
            reason="Deterministic target-weight rebalance from fresh public marks and bounded momentum/evidence signals.",
        )
        decisions.append(decision)
        if not passed:
            continue
        event = _execute_sell(book, instrument, notional, decision, now) if action == "PAPER_SELL" else _execute_buy(book, instrument, notional, decision, now)
        if event:
            events.append(event)
    if not decisions:
        decisions.append(
            _decision(
                run_key=run_key,
                book=book,
                action="WATCH",
                status="no_material_change",
                now=now,
                instrument=None,
                paper_size=0.0,
                checks=["paper_only", "fresh marks", "target delta below material threshold"],
                risk_passed=True,
                reason="Fresh marks produced no material rebalance delta.",
            )
        )
    return decisions, events


def _postmortem_decision(book: dict[str, Any], run_key: str, now: datetime) -> dict[str, Any]:
    return _decision(
        run_key=run_key,
        book=book,
        action="POSTMORTEM_REQUIRED",
        status="postmortem_required",
        now=now,
        instrument=None,
        paper_size=0.0,
        checks=["paper_only", "terminal zero-balance state", "human postmortem required before any restart"],
        risk_passed=False,
        reason="Book equity reached zero; trading is terminal until a bad-luck versus bad-strategy postmortem is completed.",
        human_review_required=True,
    )


def _crash_event(book: dict[str, Any], run_key: str, now: datetime) -> dict[str, Any]:
    return {
        "event_id": stable_id("event", run_key, book["book_id"], "crash"),
        "idempotency_key": stable_id("idem", run_key, book["book_id"], "crash"),
        "book_id": book["book_id"],
        "event_type": "book_crashed",
        "equity": summarize_book(book)["equity"],
        "generated_at": iso_z(now),
        "paper_only": True,
        "postmortem_required": True,
    }


def _mark_event(book: dict[str, Any], run_key: str, now: datetime) -> dict[str, Any]:
    summary = summarize_book(book)
    return {
        "event_id": stable_id("event", run_key, book["book_id"], "mark"),
        "idempotency_key": stable_id("idem", run_key, book["book_id"], "mark"),
        "book_id": book["book_id"],
        "event_type": "mark",
        "generated_at": iso_z(now),
        "paper_only": True,
        **summary,
    }


def process_tick(
    raw_ledger: dict[str, Any] | None,
    market_snapshot: dict[str, Any],
    *,
    now: datetime | None = None,
    run_idempotency_key: str,
) -> dict[str, Any]:
    current = now or datetime.now(timezone.utc)
    if not _valid_idempotency_key(run_idempotency_key):
        raise ValueError("run_idempotency_key must be a nonempty header-safe string")
    ledger = migrate_ledger(raw_ledger, current)
    processed = list(ledger.get("processed_idempotency_keys") or [])
    if run_idempotency_key in processed:
        return {"ledger": ledger, "decisions": [], "events": [], "replayed": True}

    instruments = _snapshot_index(market_snapshot if isinstance(market_snapshot, dict) else {})
    decisions: list[dict[str, Any]] = []
    events: list[dict[str, Any]] = []
    for book in ledger["books"]:
        book["previous_equity"] = money(book.get("equity", book.get("starting_balance", TOTAL_STARTING_BALANCE)))
        _mark_book(book, instruments, current)
        settlement_decisions, settlement_events = _settle_terminal_positions(book, instruments, current, run_idempotency_key)
        pre_trade = summarize_book(book)
        book["equity"] = pre_trade["equity"]
        book["high_water_mark"] = money(max(to_float(book.get("high_water_mark")), pre_trade["equity"], book["starting_balance"]))
        book["max_drawdown_pct"] = max(to_float(book.get("max_drawdown_pct")), pre_trade["drawdown_pct"])

        if book.get("postmortem_required") or pre_trade["equity"] <= CRASH_EQUITY_THRESHOLD:
            newly_crashed = not book.get("postmortem_required")
            book["status"] = "crashed"
            book["postmortem_required"] = True
            book["crashed_at"] = book.get("crashed_at") or iso_z(current)
            book["crash_reason"] = book.get("crash_reason") or "equity_at_or_below_zero_threshold"
            book_decisions = [_postmortem_decision(book, run_idempotency_key, current)]
            book_events = [_crash_event(book, run_idempotency_key, current)] if newly_crashed else []
        elif pre_trade["stale_open_marks"] > 0:
            book_decisions = [
                _decision(
                    run_key=run_idempotency_key,
                    book=book,
                    action="AVOID",
                    status="stale_open_mark",
                    now=current,
                    instrument=None,
                    paper_size=0.0,
                    checks=["paper_only", "all open marks fresh before any rebalance"],
                    risk_passed=False,
                    reason="At least one open position lacks a fresh mark; the entire book is frozen without defensive liquidation.",
                )
            ]
            book_events = []
        elif book.get("initial_allocation_complete"):
            book_decisions, book_events = _rebalance_book(book, instruments, current, run_idempotency_key)
        else:
            book_decisions, book_events = _seed_book(book, instruments, current, run_idempotency_key)
        decisions.extend(settlement_decisions)
        decisions.extend(book_decisions)
        events.extend(settlement_events)
        events.extend(book_events)

        post_trade = summarize_book(book)
        book["equity"] = post_trade["equity"]
        book["high_water_mark"] = money(max(to_float(book.get("high_water_mark")), post_trade["equity"], book["starting_balance"]))
        book["max_drawdown_pct"] = max(to_float(book.get("max_drawdown_pct")), post_trade["drawdown_pct"])
        book["last_decision_at"] = iso_z(current)
        book["updated_at"] = iso_z(current)
        book["status"] = post_trade["status"]
        events.append(_mark_event(book, run_idempotency_key, current))

    processed.append(run_idempotency_key)
    ledger["processed_idempotency_keys"] = processed
    ledger["updated_at"] = iso_z(current)
    return {"ledger": ledger, "decisions": decisions, "events": events, "replayed": False}
