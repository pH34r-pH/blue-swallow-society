#!/usr/bin/env python3
"""Public, dependency-free market adapters for the Mosaic & Murmurs paper engine."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Callable
from urllib.parse import urlencode
from urllib.request import Request, urlopen

USER_AGENT = "BlueSwallowSociety/1.0 (+https://blueswallow.net)"
COINGECKO_URL = "https://api.coingecko.com/api/v3/coins/markets?" + urlencode(
    {
        "vs_currency": "usd",
        "ids": "bitcoin,ethereum,solana",
        "price_change_percentage": "24h,7d",
    }
)
POLYMARKET_URL = "https://gamma-api.polymarket.com/markets?" + urlencode(
    {
        "active": "true",
        "closed": "false",
        "limit": "20",
        "order": "volume24hr",
        "ascending": "false",
    }
)
CBOE_URL = "https://cdn.cboe.com/api/global/delayed_quotes/quotes/{symbol}.json"
EQUITY_BOOK_TAGS = {
    "SPY": ["equity_watch"],
    "QQQ": ["equity_watch"],
    "MSFT": ["equity_watch", "local_event_watch"],
    "AMZN": ["local_event_watch"],
    "COST": ["local_event_watch"],
    "SBUX": ["local_event_watch"],
    "BA": ["local_event_watch"],
    "HACK": ["ai_cyber_watch"],
    "CIBR": ["ai_cyber_watch"],
    "AIQ": ["ai_cyber_watch"],
}


def iso_z(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def normalize_iso(value: Any) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip().replace(" ", "T")
    if text.endswith("Z"):
        return text
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return iso_z(parsed)


def to_float(value: Any, default: float = 0.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed == parsed and parsed not in {float("inf"), float("-inf")} else default


def parse_json_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return []
        return parsed if isinstance(parsed, list) else []
    return []


def fetch_json(url: str, timeout: int = 12) -> Any:
    request = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json, text/plain, */*",
        },
    )
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read(4_000_000).decode("utf-8", errors="replace"))


def parse_cboe_quote(payload: dict[str, Any], now: datetime, book_tags: list[str]) -> dict[str, Any] | None:
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        return None
    symbol = str(data.get("symbol") or payload.get("symbol") or "").upper().strip()
    mark = to_float(data.get("current_price"), 0.0)
    if not symbol or mark <= 0:
        return None
    as_of = normalize_iso(data.get("last_trade_time"))
    if as_of is None:
        return None
    change_pct = to_float(data.get("price_change_percent"), 0.0)
    return {
        "instrument_ref": f"equity:{symbol}",
        "instrument_type": "equity",
        "symbol": symbol,
        "title": symbol,
        "mark_price": mark,
        "previous_close": to_float(data.get("close") or data.get("prev_day_close"), mark),
        "momentum_score": change_pct,
        "price_change_percentage_24h": change_pct,
        "volume": to_float(data.get("volume"), 0.0),
        "retrieved_at": iso_z(now),
        "as_of": as_of,
        "source_id": "cboe_delayed_quotes",
        "source_url": CBOE_URL.format(symbol=symbol),
        "book_tags": list(book_tags),
    }


def parse_coingecko_markets(payload: Any, now: datetime) -> list[dict[str, Any]]:
    if not isinstance(payload, list):
        return []
    instruments: list[dict[str, Any]] = []
    for coin in payload:
        if not isinstance(coin, dict):
            continue
        asset_id = str(coin.get("id") or "").strip()
        symbol = str(coin.get("symbol") or "").upper().strip()
        mark = to_float(coin.get("current_price"), 0.0)
        as_of = normalize_iso(coin.get("last_updated"))
        if not asset_id or not symbol or mark <= 0 or not as_of:
            continue
        change_24h = to_float(coin.get("price_change_percentage_24h"), 0.0)
        change_7d = to_float(
            coin.get("price_change_percentage_7d_in_currency", coin.get("price_change_percentage_7d")),
            0.0,
        )
        momentum = change_24h * 0.7 + change_7d * 0.3
        instruments.append(
            {
                "instrument_ref": f"crypto:{asset_id}",
                "instrument_type": "crypto",
                "asset_id": asset_id,
                "symbol": symbol,
                "title": str(coin.get("name") or symbol),
                "mark_price": mark,
                "previous_close": mark / (1.0 + change_24h / 100.0) if change_24h > -100 else mark,
                "momentum_score": round(momentum, 6),
                "price_change_percentage_24h": change_24h,
                "price_change_percentage_7d": change_7d,
                "liquidity": to_float(coin.get("total_volume"), 0.0),
                "market_cap_rank": coin.get("market_cap_rank"),
                "retrieved_at": iso_z(now),
                "as_of": as_of,
                "source_id": "coingecko_markets",
                "source_url": f"https://www.coingecko.com/en/coins/{asset_id}",
                "book_tags": ["crypto"],
            }
        )
    return instruments


def parse_polymarket_markets(payload: Any, now: datetime) -> list[dict[str, Any]]:
    if not isinstance(payload, list):
        return []
    instruments: list[dict[str, Any]] = []
    for market in payload:
        if not isinstance(market, dict):
            continue
        market_id = str(market.get("id") or market.get("conditionId") or "").strip()
        outcomes = parse_json_list(market.get("outcomes"))
        prices = parse_json_list(market.get("outcomePrices"))
        if not market_id or len(outcomes) != len(prices):
            continue
        normalized = [(str(outcome).upper(), to_float(price, -1.0)) for outcome, price in zip(outcomes, prices)]
        names = {name for name, _ in normalized}
        if not {"YES", "NO"}.issubset(names):
            continue
        as_of = normalize_iso(market.get("updatedAt") or market.get("createdAt")) or iso_z(now)
        title = str(market.get("question") or market.get("title") or market_id)
        slug = str(market.get("slug") or "")
        source_url = f"https://polymarket.com/event/{slug}" if slug else "https://polymarket.com/"
        for outcome, mark in normalized:
            if outcome not in {"YES", "NO"} or not 0 < mark < 1:
                continue
            instruments.append(
                {
                    "instrument_ref": f"polymarket:{market_id}:{outcome}",
                    "instrument_type": "prediction_market",
                    "market_id": market_id,
                    "outcome": outcome,
                    "symbol": outcome,
                    "title": f"{outcome} — {title}",
                    "mark_price": mark,
                    "previous_close": mark,
                    "momentum_score": 0.0,
                    "signal_score": 0.0,
                    "liquidity": to_float(market.get("liquidity"), 0.0),
                    "volume_24h": to_float(market.get("volume24hr", market.get("volume24h")), 0.0),
                    "end_date": normalize_iso(market.get("endDate") or market.get("endDateIso")),
                    "retrieved_at": iso_z(now),
                    "as_of": as_of,
                    "source_id": "polymarket_gamma",
                    "source_url": source_url,
                    "book_tags": ["prediction_markets"],
                }
            )
    return instruments


def collect_market_snapshot(
    now: datetime | None = None,
    *,
    timeout: int = 12,
    fetcher: Callable[[str, int], Any] = fetch_json,
) -> dict[str, Any]:
    current = now or datetime.now(timezone.utc)
    instruments: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []

    try:
        instruments.extend(parse_coingecko_markets(fetcher(COINGECKO_URL, timeout), current))
    except Exception as exc:  # One source failure must not erase other fresh marks.
        errors.append({"source_id": "coingecko_markets", "error": f"{type(exc).__name__}: {exc}"})

    try:
        instruments.extend(parse_polymarket_markets(fetcher(POLYMARKET_URL, timeout), current))
    except Exception as exc:
        errors.append({"source_id": "polymarket_gamma", "error": f"{type(exc).__name__}: {exc}"})

    for symbol, book_tags in EQUITY_BOOK_TAGS.items():
        try:
            parsed = parse_cboe_quote(fetcher(CBOE_URL.format(symbol=symbol), timeout), current, book_tags)
            if parsed:
                instruments.append(parsed)
            else:
                errors.append({"source_id": f"cboe:{symbol}", "error": "invalid or empty quote"})
        except Exception as exc:
            errors.append({"source_id": f"cboe:{symbol}", "error": f"{type(exc).__name__}: {exc}"})

    return {
        "schema_version": 1,
        "generated_at": iso_z(current),
        "paper_only": True,
        "instruments": instruments,
        "source_counts": {
            "coingecko_markets": sum(1 for item in instruments if item.get("source_id") == "coingecko_markets"),
            "polymarket_gamma": sum(1 for item in instruments if item.get("source_id") == "polymarket_gamma"),
            "cboe_delayed_quotes": sum(1 for item in instruments if item.get("source_id") == "cboe_delayed_quotes"),
        },
        "errors": errors,
    }
