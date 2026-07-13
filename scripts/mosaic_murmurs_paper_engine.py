#!/usr/bin/env python3
"""Deterministic autonomous paper-only portfolio engine for Mosaic & Murmurs."""

from __future__ import annotations

import copy
import hashlib
from datetime import datetime, timezone
from typing import Any

SCHEMA_VERSION = 3
INITIAL_BANK_CAPITAL = 1_000.0
ADDITIONAL_INVESTMENT_CAPITAL = 1_000.0
TOTAL_STARTING_BALANCE = INITIAL_BANK_CAPITAL + ADDITIONAL_INVESTMENT_CAPITAL
TARGET_GROSS_EXPOSURE_FRACTION = 0.50
MAX_INSTRUMENT_EXPOSURE_FRACTION = 0.25
MAX_ORDER_NOTIONAL = 500.0
MIN_ORDER_NOTIONAL = 25.0
BUY_COOLDOWN_HOURS = 1.0
MAX_DRAWDOWN_PCT = 10.0
MAX_DAILY_LOSS_PCT = 5.0
FAST_MARK_MAX_AGE_HOURS = 2.0
EQUITY_MARK_MAX_AGE_HOURS = 96.0
MAX_PROCESSED_KEYS = 512

BOOK_SPECS: list[dict[str, Any]] = [
    {
        "book_id": "prediction_markets",
        "display_name": "Prediction Markets",
        "loop_affinity": "bridge",
        "instrument_type": "prediction_market",
        "strategy": "Evidence/attention/market probability deltas with a neutral binary-market seed.",
        "seed_symbols": [],
    },
    {
        "book_id": "crypto",
        "display_name": "Crypto",
        "loop_affinity": "bridge",
        "instrument_type": "crypto",
        "strategy": "Liquid crypto momentum and risk-off exits from public marks.",
        "seed_symbols": ["BTC", "ETH", "SOL"],
    },
    {
        "book_id": "equity_watch",
        "display_name": "Equity Watch",
        "loop_affinity": "mosaic",
        "instrument_type": "equity",
        "strategy": "Broad equity and Microsoft risk radar through liquid public-market proxies.",
        "seed_symbols": ["SPY", "QQQ", "MSFT"],
    },
    {
        "book_id": "local_event_watch",
        "display_name": "Local Event Watch",
        "loop_affinity": "mosaic",
        "instrument_type": "equity",
        "strategy": "Seattle/Redmond/PNW economic proxy basket with evidence-bound local-event overlays.",
        "seed_symbols": ["MSFT", "AMZN", "COST", "SBUX", "BA"],
    },
    {
        "book_id": "ai_cyber_watch",
        "display_name": "AI/Cyber Watch",
        "loop_affinity": "murmurs",
        "instrument_type": "equity",
        "strategy": "AI/cyber thematic ETF momentum constrained by Mosaic/Murmurs evidence quality.",
        "seed_symbols": ["HACK", "CIBR", "AIQ"],
    },
]
BOOK_IDS = [spec["book_id"] for spec in BOOK_SPECS]
BOOK_SPEC_BY_ID = {spec["book_id"]: spec for spec in BOOK_SPECS}


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
        "loop_affinity": spec["loop_affinity"],
        "instrument_type": spec["instrument_type"],
        "strategy": spec["strategy"],
        "starting_balance": TOTAL_STARTING_BALANCE,
        "cash_balance": TOTAL_STARTING_BALANCE,
        "initial_bank_capital": INITIAL_BANK_CAPITAL,
        "additional_capital_contribution": ADDITIONAL_INVESTMENT_CAPITAL,
        "funding_migration_applied": True,
        "initial_allocation_complete": False,
        "positions": [],
        "realized_pnl": 0.0,
        "equity": TOTAL_STARTING_BALANCE,
        "previous_equity": TOTAL_STARTING_BALANCE,
        "high_water_mark": TOTAL_STARTING_BALANCE,
        "max_drawdown_pct": 0.0,
        "last_trade_at": None,
        "last_decision_at": None,
        "status": "awaiting_initial_allocation",
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
        "updated_at": iso_z(current),
        "processed_idempotency_keys": [],
        "books": [_new_book(spec, current) for spec in BOOK_SPECS],
    }


def _normalize_position(raw: dict[str, Any]) -> dict[str, Any]:
    position = dict(raw)
    entry_price = to_float(position.get("entry_price", position.get("basis")), 0.0)
    mark_price = to_float(position.get("mark_price", position.get("mark", entry_price)), entry_price)
    quantity = to_float(position.get("quantity"), 0.0)
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
            "cost_basis": money(position.get("cost_basis", quantity * entry_price)),
            "market_value": money(position.get("market_value", quantity * mark_price)),
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
    source = copy.deepcopy(raw) if isinstance(raw, dict) else {}
    existing = {
        str(book.get("book_id") or book.get("id")): book
        for book in source.get("books", [])
        if isinstance(book, dict) and (book.get("book_id") or book.get("id"))
    }
    books: list[dict[str, Any]] = []
    for spec in BOOK_SPECS:
        old = copy.deepcopy(existing.get(spec["book_id"], {}))
        if not old:
            books.append(_new_book(spec, current))
            continue

        starting_balance = to_float(old.get("starting_balance", old.get("starting_equity")), INITIAL_BANK_CAPITAL)
        cash_balance = to_float(old.get("cash_balance", old.get("cash", starting_balance)), starting_balance)
        migration_applied = bool(old.get("funding_migration_applied"))
        if not migration_applied:
            starting_balance += ADDITIONAL_INVESTMENT_CAPITAL
            cash_balance += ADDITIONAL_INVESTMENT_CAPITAL
            migration_applied = True

        positions = [_normalize_position(position) for position in old.get("positions", []) if isinstance(position, dict)]
        gross = money(sum(abs(position["market_value"]) for position in positions))
        equity = money(cash_balance + gross)
        high_water = max(to_float(old.get("high_water_mark"), starting_balance), starting_balance, equity)
        initial_complete = bool(old.get("initial_allocation_complete")) or gross >= ADDITIONAL_INVESTMENT_CAPITAL - 0.01
        book = {
            **old,
            "book_id": spec["book_id"],
            "display_name": str(old.get("display_name") or spec["display_name"]),
            "loop_affinity": str(old.get("loop_affinity") or spec["loop_affinity"]),
            "instrument_type": str(old.get("instrument_type") or spec["instrument_type"]),
            "strategy": str(old.get("strategy") or spec["strategy"]),
            "starting_balance": money(starting_balance),
            "cash_balance": money(cash_balance),
            "initial_bank_capital": money(old.get("initial_bank_capital", INITIAL_BANK_CAPITAL)),
            "additional_capital_contribution": money(old.get("additional_capital_contribution", ADDITIONAL_INVESTMENT_CAPITAL)),
            "funding_migration_applied": migration_applied,
            "initial_allocation_complete": initial_complete,
            "positions": positions,
            "realized_pnl": money(old.get("realized_pnl", old.get("closed_pnl", 0.0))),
            "equity": money(old.get("equity", equity)),
            "previous_equity": money(old.get("previous_equity", old.get("equity", equity))),
            "high_water_mark": money(high_water),
            "max_drawdown_pct": round(to_float(old.get("max_drawdown_pct")), 4),
            "last_trade_at": old.get("last_trade_at"),
            "last_decision_at": old.get("last_decision_at"),
            "status": str(old.get("status") or ("active" if initial_complete else "awaiting_initial_allocation")),
            "created_at": old.get("created_at") or iso_z(current),
            "updated_at": old.get("updated_at") or iso_z(current),
        }
        books.append(book)

    return {
        **source,
        "schema_version": SCHEMA_VERSION,
        "currency": str(source.get("currency") or "USD"),
        "paper_only": True,
        "autonomous_execution": True,
        "updated_at": source.get("updated_at") or iso_z(current),
        "processed_idempotency_keys": list(source.get("processed_idempotency_keys") or [])[-MAX_PROCESSED_KEYS:],
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
    if not book.get("initial_allocation_complete"):
        status = "awaiting_initial_allocation" if not stale else "stale"
    return {
        "book_id": book["book_id"],
        "display_name": book["display_name"],
        "starting_balance": starting,
        "cash_balance": cash,
        "equity": equity,
        "open_position_count": len(positions),
        "gross_paper_exposure": gross,
        "daily_pnl": daily,
        "daily_pnl_pct": round((daily / previous_equity * 100.0) if previous_equity else 0.0, 4),
        "realized_pnl": realized,
        "unrealized_pnl": unrealized,
        "cumulative_pnl": cumulative,
        "cumulative_pnl_pct": round((cumulative / starting * 100.0) if starting else 0.0, 4),
        "drawdown_pct": round(drawdown, 4),
        "max_drawdown_pct": round(max(to_float(book.get("max_drawdown_pct")), drawdown), 4),
        "stale_open_marks": stale,
        "status": status,
    }


def _age_hours(value: Any, now: datetime) -> float | None:
    parsed = parse_iso(value)
    if parsed is None:
        return None
    return max(0.0, (now - parsed).total_seconds() / 3600.0)


def instrument_fresh(instrument: dict[str, Any], now: datetime) -> tuple[bool, str]:
    mark = to_float(instrument.get("mark_price"), 0.0)
    if mark <= 0:
        return False, "missing or invalid mark"
    retrieved_age = _age_hours(instrument.get("retrieved_at"), now)
    if retrieved_age is None or retrieved_age > FAST_MARK_MAX_AGE_HOURS:
        return False, "stale retrieval"
    market_age = _age_hours(instrument.get("as_of"), now)
    max_market_age = EQUITY_MARK_MAX_AGE_HOURS if instrument.get("instrument_type") == "equity" else FAST_MARK_MAX_AGE_HOURS
    if market_age is None or market_age > max_market_age:
        return False, "stale market mark"
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
        fresh, _ = instrument_fresh(current or {}, now)
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


def _seed_instruments(book: dict[str, Any], instruments: dict[str, dict[str, Any]], now: datetime) -> tuple[list[dict[str, Any]], list[str]]:
    spec = BOOK_SPEC_BY_ID[book["book_id"]]
    if book["book_id"] == "prediction_markets":
        by_market: dict[str, list[dict[str, Any]]] = {}
        for item in instruments.values():
            if item.get("instrument_type") == "prediction_market" and item.get("market_id"):
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
                and book["book_id"] in (candidate.get("book_tags") or [])
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
        "human_review_required": False,
        "review_required": False,
        "generated_at": iso_z(now),
        "source_ref": (instrument or {}).get("source_id"),
        "source_url": (instrument or {}).get("source_url"),
    }


def _position_for(book: dict[str, Any], instrument_ref: str) -> dict[str, Any] | None:
    return next((position for position in book.get("positions", []) if position.get("instrument_ref") == instrument_ref), None)


def _execute_buy(book: dict[str, Any], instrument: dict[str, Any], notional: float, decision: dict[str, Any], now: datetime) -> dict[str, Any]:
    before_cash = money(book["cash_balance"])
    mark = to_float(instrument["mark_price"])
    quantity = notional / mark
    existing = _position_for(book, instrument["instrument_ref"])
    before_quantity = to_float((existing or {}).get("quantity"))
    if existing:
        old_cost = to_float(existing.get("cost_basis"), before_quantity * to_float(existing.get("entry_price")))
        new_quantity = before_quantity + quantity
        existing["quantity"] = round(new_quantity, 10)
        existing["cost_basis"] = money(old_cost + notional)
        existing["entry_price"] = round((old_cost + notional) / new_quantity, 10)
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
            "entry_price": round(mark, 10),
            "mark_price": round(mark, 10),
            "previous_mark_price": round(mark, 10),
            "cost_basis": money(notional),
            "market_value": money(notional),
            "mark_status": "fresh",
            "source_id": instrument.get("source_id"),
            "source_url": instrument.get("source_url"),
            "opened_at": iso_z(now),
            "updated_at": iso_z(now),
        }
        book.setdefault("positions", []).append(position)
    book["cash_balance"] = money(before_cash - notional)
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
        "cash_before": before_cash,
        "cash_after": book["cash_balance"],
        "position_quantity_before": round(before_quantity, 10),
        "position_quantity_after": position["quantity"],
        "generated_at": iso_z(now),
        "paper_only": True,
        "autonomous_execution": True,
    }


def _execute_sell(book: dict[str, Any], instrument: dict[str, Any], notional: float, decision: dict[str, Any], now: datetime) -> dict[str, Any] | None:
    position = _position_for(book, instrument["instrument_ref"])
    if position is None:
        return None
    mark = to_float(instrument["mark_price"])
    held_quantity = to_float(position.get("quantity"))
    held_market_value = held_quantity * mark
    sell_quantity = held_quantity if notional >= held_market_value - 0.01 else min(held_quantity, notional / mark)
    if sell_quantity <= 0:
        return None
    before_cash = money(book["cash_balance"])
    proceeds = sell_quantity * mark
    basis_cost = sell_quantity * to_float(position.get("entry_price"))
    remaining = max(0.0, held_quantity - sell_quantity)
    book["cash_balance"] = money(before_cash + proceeds)
    book["realized_pnl"] = money(to_float(book.get("realized_pnl")) + proceeds - basis_cost)
    if remaining <= 0.00000001:
        book["positions"] = [entry for entry in book.get("positions", []) if entry is not position]
    else:
        position["quantity"] = round(remaining, 10)
        position["cost_basis"] = money(remaining * to_float(position.get("entry_price")))
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
        "paper_size": money(proceeds),
        "realized_pnl": money(proceeds - basis_cost),
        "cash_before": before_cash,
        "cash_after": book["cash_balance"],
        "position_quantity_before": round(held_quantity, 10),
        "position_quantity_after": round(remaining, 10),
        "generated_at": iso_z(now),
        "paper_only": True,
        "autonomous_execution": True,
    }


def _risk_checks(
    book: dict[str, Any],
    action: str,
    notional: float,
    instrument: dict[str, Any],
    now: datetime,
    *,
    enforce_cooldown: bool = True,
) -> tuple[bool, list[str]]:
    checks = ["paper_only", "fresh mark", "idempotent decision", "no leverage"]
    fresh, freshness_reason = instrument_fresh(instrument, now)
    if not fresh:
        checks.append(f"stale mark blocked: {freshness_reason}")
        return False, checks
    if notional > MAX_ORDER_NOTIONAL + 0.01:
        checks.append("order notional exceeds maximum")
        return False, checks
    if action == "PAPER_BUY":
        summary = summarize_book(book)
        if summary["drawdown_pct"] >= MAX_DRAWDOWN_PCT:
            checks.append("drawdown stop blocks buys")
            return False, checks
        if summary["daily_pnl_pct"] <= -MAX_DAILY_LOSS_PCT:
            checks.append("daily loss stop blocks buys")
            return False, checks
        last_trade = parse_iso(book.get("last_trade_at"))
        if enforce_cooldown and last_trade and (now - last_trade).total_seconds() < BUY_COOLDOWN_HOURS * 3600:
            checks.append("buy cooldown active")
            return False, checks
        if to_float(book.get("cash_balance")) + 0.001 < notional:
            checks.append("insufficient cash")
            return False, checks
    checks.append("risk policy passed")
    return True, checks


def _seed_book(book: dict[str, Any], instruments: dict[str, dict[str, Any]], now: datetime, run_key: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
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

    notionals = _split_notional(ADDITIONAL_INVESTMENT_CAPITAL, len(selected))
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
    book["initial_allocation_complete"] = money(sum(_market_value(position) for position in book.get("positions", []))) >= ADDITIONAL_INVESTMENT_CAPITAL - 0.01
    book["status"] = "active" if book["initial_allocation_complete"] else "allocation_blocked"
    return decisions, events


def _target_notionals(book: dict[str, Any], instruments: dict[str, dict[str, Any]], now: datetime) -> dict[str, float]:
    summary = summarize_book(book)
    if summary["drawdown_pct"] >= MAX_DRAWDOWN_PCT or summary["daily_pnl_pct"] <= -MAX_DAILY_LOSS_PCT:
        return {position["instrument_ref"]: 0.0 for position in book.get("positions", [])}

    if book["book_id"] == "prediction_markets":
        current = {position["instrument_ref"]: _market_value(position) for position in book.get("positions", [])}
        signals = [
            item
            for item in instruments.values()
            if item.get("instrument_type") == "prediction_market"
            and _position_for(book, item["instrument_ref"])
            and instrument_fresh(item, now)[0]
            and abs(to_float(item.get("signal_score"))) > 0.05
        ]
        if not signals:
            return current
        selected = max(signals, key=lambda item: abs(to_float(item.get("signal_score"))))
        return {ref: (min(MAX_ORDER_NOTIONAL, summary["equity"] * MAX_INSTRUMENT_EXPOSURE_FRACTION) if ref == selected["instrument_ref"] else 0.0) for ref in current}

    eligible = [
        item
        for item in instruments.values()
        if book["book_id"] in (item.get("book_tags") or [])
        and instrument_fresh(item, now)[0]
    ]
    positive = [item for item in eligible if to_float(item.get("momentum_score")) > 0]
    refs = {position["instrument_ref"] for position in book.get("positions", [])} | {item["instrument_ref"] for item in eligible}
    targets = {ref: 0.0 for ref in refs}
    if not positive:
        return targets
    gross_target = summary["equity"] * TARGET_GROSS_EXPOSURE_FRACTION
    per_instrument = min(gross_target / len(positive), summary["equity"] * MAX_INSTRUMENT_EXPOSURE_FRACTION)
    for item in positive:
        targets[item["instrument_ref"]] = money(per_instrument)
    return targets


def _rebalance_book(book: dict[str, Any], instruments: dict[str, dict[str, Any]], now: datetime, run_key: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    targets = _target_notionals(book, instruments, now)
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
        if abs(delta) < MIN_ORDER_NOTIONAL:
            continue
        orders.append(("PAPER_SELL" if delta < 0 else "PAPER_BUY", instrument, min(abs(delta), MAX_ORDER_NOTIONAL)))

    # Free cash and reduce risk before evaluating buys.
    orders.sort(key=lambda entry: 0 if entry[0] == "PAPER_SELL" else 1)
    decisions: list[dict[str, Any]] = []
    events: list[dict[str, Any]] = []
    for action, instrument, notional in orders:
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
        pre_trade = summarize_book(book)
        book["equity"] = pre_trade["equity"]
        book["high_water_mark"] = money(max(to_float(book.get("high_water_mark")), pre_trade["equity"], book["starting_balance"]))
        book["max_drawdown_pct"] = max(to_float(book.get("max_drawdown_pct")), pre_trade["drawdown_pct"])

        if book.get("initial_allocation_complete"):
            book_decisions, book_events = _rebalance_book(book, instruments, current, run_idempotency_key)
        else:
            book_decisions, book_events = _seed_book(book, instruments, current, run_idempotency_key)
        decisions.extend(book_decisions)
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
    ledger["processed_idempotency_keys"] = processed[-MAX_PROCESSED_KEYS:]
    ledger["updated_at"] = iso_z(current)
    return {"ledger": ledger, "decisions": decisions, "events": events, "replayed": False}
