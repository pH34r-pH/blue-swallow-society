#!/usr/bin/env python3
"""Collect Mosaic & Murmurs morning-brief inputs.

This is intentionally dependency-free. It gathers public RSS/JSON signals,
normalizes them into a machine-readable manifest, computes the local paper-book
footer from a JSON ledger, writes the full manifest to disk, and prints a compact
JSON packet for Hermes cron to synthesize into the operator-facing brief.
"""

from __future__ import annotations

import argparse
import html
import json
import math
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover - Python 3.11 is expected here.
    ZoneInfo = None  # type: ignore[assignment]

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from mosaic_murmurs_paper_engine import (  # noqa: E402 - sibling script import
    default_ledger as engine_default_ledger,
    migrate_ledger as engine_migrate_ledger,
    summarize_book as engine_summarize_book,
)

DEFAULT_PAPER_RUNTIME_DIR = Path.home() / ".hermes" / "mosaic-murmurs" / "paper-memory-loop"
DEFAULT_LEDGER = DEFAULT_PAPER_RUNTIME_DIR / "paper-ledger.json"
DEFAULT_PAPER_STATE = DEFAULT_PAPER_RUNTIME_DIR / "latest_state.json"
DEFAULT_RUNTIME_DIR = Path.home() / ".hermes" / "mosaic-murmurs" / "morning-brief"
USER_AGENT = "BlueSwallowMorningBrief/0.1 (https://blueswallow.net; local operator collector)"
MAX_SUMMARY_CHARS = 360

MATERIALITY_KEYWORDS = {
    "washington": 4,
    "seattle": 5,
    "bellevue": 5,
    "redmond": 5,
    "king county": 5,
    "microsoft": 4,
    "openai": 4,
    "ai": 3,
    "cyber": 3,
    "security": 2,
    "breach": 4,
    "emergency": 4,
    "wildfire": 4,
    "earthquake": 4,
    "court": 2,
    "supreme court": 4,
    "election": 4,
    "congress": 3,
    "federal reserve": 4,
    "fed": 3,
    "inflation": 3,
    "tariff": 3,
    "crypto": 3,
    "bitcoin": 3,
    "polymarket": 3,
    "ukraine": 3,
    "china": 3,
    "iran": 3,
    "israel": 3,
    "russia": 3,
}

RSS_SOURCES: list[dict[str, str]] = [
    {
        "id": "google-news-washington",
        "name": "Google News — WA/Seattle/Bellevue/Redmond",
        "lane": "mosaic",
        "scope": "washington_state",
        "source_class": "news_aggregator",
        "url": "https://news.google.com/rss/search?"
        + urlencode(
            {
                "q": "Washington State OR Seattle OR Bellevue OR Redmond when:2d",
                "hl": "en-US",
                "gl": "US",
                "ceid": "US:en",
            }
        ),
    },
    {
        "id": "google-news-us",
        "name": "Google News — US Top Stories",
        "lane": "mosaic",
        "scope": "us",
        "source_class": "news_aggregator",
        "url": "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en",
    },
    {
        "id": "google-news-ai-cyber-markets",
        "name": "Google News — AI/Cyber/Markets",
        "lane": "mosaic",
        "scope": "operator_context",
        "source_class": "news_aggregator",
        "url": "https://news.google.com/rss/search?"
        + urlencode(
            {
                "q": "AI OR OpenAI OR Microsoft OR cybersecurity OR crypto when:2d",
                "hl": "en-US",
                "gl": "US",
                "ceid": "US:en",
            }
        ),
    },
    {
        "id": "seattle-times-local",
        "name": "Seattle Times — Seattle News",
        "lane": "mosaic",
        "scope": "washington_state",
        "source_class": "local_news",
        "url": "https://www.seattletimes.com/seattle-news/feed/",
    },
    {
        "id": "seattle-mayor",
        "name": "Seattle Mayor Blog",
        "lane": "mosaic",
        "scope": "washington_state",
        "source_class": "official_local",
        "url": "https://harrell.seattle.gov/feed/",
    },
    {
        "id": "washington-state-standard",
        "name": "Washington State Standard",
        "lane": "mosaic",
        "scope": "washington_state",
        "source_class": "local_news",
        "url": "https://washingtonstatestandard.com/feed/",
    },
    {
        "id": "geekwire",
        "name": "GeekWire",
        "lane": "mosaic",
        "scope": "operator_context",
        "source_class": "tech_news",
        "url": "https://www.geekwire.com/feed/",
    },
    {
        "id": "npr-news",
        "name": "NPR News",
        "lane": "mosaic",
        "scope": "us",
        "source_class": "national_news",
        "url": "https://feeds.npr.org/1001/rss.xml",
    },
    {
        "id": "cisa-advisories",
        "name": "CISA Cybersecurity Advisories",
        "lane": "mosaic",
        "scope": "us",
        "source_class": "official_cyber",
        "url": "https://www.cisa.gov/cybersecurity-advisories/all.xml",
    },
    {
        "id": "sec-press",
        "name": "SEC Press Releases",
        "lane": "mosaic",
        "scope": "us",
        "source_class": "official_market",
        "url": "https://www.sec.gov/news/pressreleases.rss",
    },
    {
        "id": "fed-press",
        "name": "Federal Reserve Press Releases",
        "lane": "mosaic",
        "scope": "us",
        "source_class": "official_market",
        "url": "https://www.federalreserve.gov/feeds/press_all.xml",
    },
    {
        "id": "google-trends-us",
        "name": "Google Trends — US Trending Searches",
        "lane": "murmurs",
        "scope": "us",
        "source_class": "public_trends",
        "url": "https://trends.google.com/trending/rss?geo=US",
    },
    {
        "id": "lobsters",
        "name": "Lobsters",
        "lane": "murmurs",
        "scope": "operator_context",
        "source_class": "public_forum",
        "url": "https://lobste.rs/rss",
    },
    {
        "id": "slashdot-main",
        "name": "Slashdot Main",
        "lane": "murmurs",
        "scope": "global",
        "source_class": "tech_forum",
        "url": "https://rss.slashdot.org/Slashdot/slashdotMain",
    },
    {
        "id": "product-hunt",
        "name": "Product Hunt",
        "lane": "murmurs",
        "scope": "global",
        "source_class": "startup_products",
        "url": "https://www.producthunt.com/feed",
    },
    {
        "id": "mastodon-ai",
        "name": "Mastodon tag — AI",
        "lane": "murmurs",
        "scope": "global",
        "source_class": "federated_social",
        "url": "https://mastodon.social/tags/ai.rss",
    },
    {
        "id": "mastodon-cybersecurity",
        "name": "Mastodon tag — Cybersecurity",
        "lane": "murmurs",
        "scope": "global",
        "source_class": "federated_social",
        "url": "https://mastodon.social/tags/cybersecurity.rss",
    },
    {
        "id": "mastodon-crypto",
        "name": "Mastodon tag — Crypto",
        "lane": "murmurs",
        "scope": "market",
        "source_class": "federated_social",
        "url": "https://mastodon.social/tags/crypto.rss",
    },
    {
        "id": "krebs-security",
        "name": "Krebs on Security",
        "lane": "mosaic",
        "scope": "operator_context",
        "source_class": "security_news",
        "url": "https://krebsonsecurity.com/feed/",
    },
    {
        "id": "schneier-security",
        "name": "Schneier on Security",
        "lane": "mosaic",
        "scope": "operator_context",
        "source_class": "security_news",
        "url": "https://www.schneier.com/feed/atom/",
    },
    {
        "id": "the-record-security",
        "name": "The Record",
        "lane": "mosaic",
        "scope": "operator_context",
        "source_class": "security_news",
        "url": "https://therecord.media/feed/",
    },
    {
        "id": "github-blog",
        "name": "GitHub Blog",
        "lane": "mosaic",
        "scope": "operator_context",
        "source_class": "developer_news",
        "url": "https://github.blog/feed/",
    },
    {
        "id": "openai-blog",
        "name": "OpenAI Blog",
        "lane": "mosaic",
        "scope": "operator_context",
        "source_class": "ai_lab_news",
        "url": "https://openai.com/blog/rss.xml",
    },
]

JSON_SOURCES: list[dict[str, Any]] = [
    {
        "id": "nws-wa-alerts",
        "name": "NWS Active Alerts — WA",
        "kind": "nws_alerts",
        "lane": "mosaic",
        "scope": "washington_state",
        "source_class": "official_weather",
        "url": "https://api.weather.gov/alerts/active?area=WA",
    },
    {
        "id": "hn-front-page",
        "name": "Hacker News Front Page",
        "kind": "hn_algolia",
        "lane": "murmurs",
        "scope": "global",
        "source_class": "public_forum",
        "url": "https://hn.algolia.com/api/v1/search?tags=front_page",
    },
    {
        "id": "hn-microsoft",
        "name": "Hacker News — Microsoft",
        "kind": "hn_algolia",
        "lane": "murmurs",
        "scope": "operator_context",
        "source_class": "public_forum",
        "url": "https://hn.algolia.com/api/v1/search_by_date?"
        + urlencode({"query": "Microsoft", "tags": "story", "hitsPerPage": "20"}),
    },
    {
        "id": "hn-ai",
        "name": "Hacker News — AI",
        "kind": "hn_algolia",
        "lane": "murmurs",
        "scope": "operator_context",
        "source_class": "public_forum",
        "url": "https://hn.algolia.com/api/v1/search_by_date?"
        + urlencode({"query": "AI", "tags": "story", "hitsPerPage": "20"}),
    },
    {
        "id": "hn-cybersecurity",
        "name": "Hacker News — Cybersecurity",
        "kind": "hn_algolia",
        "lane": "murmurs",
        "scope": "operator_context",
        "source_class": "public_forum",
        "url": "https://hn.algolia.com/api/v1/search_by_date?"
        + urlencode({"query": "cybersecurity", "tags": "story", "hitsPerPage": "20"}),
    },
    {
        "id": "hn-crypto",
        "name": "Hacker News — Crypto",
        "kind": "hn_algolia",
        "lane": "murmurs",
        "scope": "market",
        "source_class": "public_forum",
        "url": "https://hn.algolia.com/api/v1/search_by_date?"
        + urlencode({"query": "crypto", "tags": "story", "hitsPerPage": "20"}),
    },
    {
        "id": "polymarket-volume24h",
        "name": "Polymarket active markets by volume",
        "kind": "polymarket_markets",
        "lane": "bridge",
        "scope": "market",
        "source_class": "prediction_market",
        "url": "https://gamma-api.polymarket.com/markets?"
        + urlencode(
            {
                "active": "true",
                "closed": "false",
                "limit": "20",
                "order": "volume24hr",
                "ascending": "false",
            }
        ),
    },
    {
        "id": "coingecko-trending",
        "name": "CoinGecko Trending Coins",
        "kind": "coingecko_trending",
        "lane": "bridge",
        "scope": "market",
        "source_class": "crypto_market",
        "url": "https://api.coingecko.com/api/v3/search/trending",
    },
    {
        "id": "coingecko-majors",
        "name": "CoinGecko Crypto Majors",
        "kind": "coingecko_markets",
        "lane": "bridge",
        "scope": "market",
        "source_class": "crypto_market",
        "url": "https://api.coingecko.com/api/v3/coins/markets?"
        + urlencode(
            {
                "vs_currency": "usd",
                "ids": "bitcoin,ethereum,solana",
                "price_change_percentage": "24h",
            }
        ),
    },
]

DEFAULT_LEDGER_DATA = engine_default_ledger(datetime.now(timezone.utc))

TAG_RE = re.compile(r"<[^>]+>")
WHITESPACE_RE = re.compile(r"\s+")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_z(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_time(value: Any) -> datetime | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        dt = parsedate_to_datetime(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except (TypeError, ValueError, IndexError, OverflowError):
        pass
    try:
        normalized = text.replace("Z", "+00:00")
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None


def clean_text(value: Any, limit: int = MAX_SUMMARY_CHARS) -> str:
    if value is None:
        return ""
    text = html.unescape(str(value))
    text = TAG_RE.sub(" ", text)
    text = WHITESPACE_RE.sub(" ", text).strip()
    if len(text) > limit:
        return text[: limit - 1].rstrip() + "…"
    return text


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def child_text(elem: ET.Element, *names: str) -> str:
    wanted = set(names)
    for child in list(elem):
        if local_name(child.tag) in wanted and child.text:
            return child.text
    return ""


def child_link(elem: ET.Element) -> str:
    for child in list(elem):
        if local_name(child.tag) == "link":
            href = child.attrib.get("href")
            if href:
                return href
            if child.text:
                return child.text
    return child_text(elem, "guid", "id")


def fetch_bytes(url: str, timeout: int) -> bytes:
    req = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/geo+json, application/rss+xml, application/atom+xml, application/json, text/xml, */*;q=0.8",
        },
    )
    with urlopen(req, timeout=timeout) as response:
        return response.read(4_000_000)


def fetch_json(url: str, timeout: int) -> Any:
    return json.loads(fetch_bytes(url, timeout).decode("utf-8", errors="replace"))


def item_id(source_id: str, title: str, url: str) -> str:
    import hashlib

    digest = hashlib.sha1(f"{source_id}\0{title}\0{url}".encode("utf-8")).hexdigest()[:12]
    return f"{source_id}-{digest}"


def collect_rss(source: dict[str, str], timeout: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    raw = fetch_bytes(source["url"], timeout)
    root = ET.fromstring(raw)
    containers = []
    if local_name(root.tag) == "rss":
        channel = next((child for child in list(root) if local_name(child.tag) == "channel"), root)
        containers = [child for child in list(channel) if local_name(child.tag) == "item"]
    elif local_name(root.tag) == "feed":
        containers = [child for child in list(root) if local_name(child.tag) == "entry"]
    else:
        containers = [child for child in root.iter() if local_name(child.tag) in {"item", "entry"}]

    items: list[dict[str, Any]] = []
    for entry in containers:
        title = clean_text(child_text(entry, "title"), limit=220)
        if not title:
            continue
        url = child_link(entry)
        published = parse_time(
            child_text(entry, "pubDate", "published", "updated", "date", "dc:date")
        )
        summary = clean_text(
            child_text(entry, "description", "summary", "content", "encoded"),
            limit=MAX_SUMMARY_CHARS,
        )
        item = {
            "id": item_id(source["id"], title, url),
            "lane": source["lane"],
            "scope": source["scope"],
            "source_id": source["id"],
            "source_name": source["name"],
            "source_class": source["source_class"],
            "title": title,
            "summary": summary,
            "url": url,
            "published_at": iso_z(published) if published else None,
            "retrieved_at": None,
            "metrics": {},
            "confidence": "medium" if source["source_class"].startswith("official") else "low",
        }
        items.append(item)
    return items, {"count": len(items)}


def collect_nws_alerts(source: dict[str, Any], timeout: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    payload = fetch_json(source["url"], timeout)
    items = []
    for feature in payload.get("features", [])[:20]:
        props = feature.get("properties", {})
        title = clean_text(props.get("headline") or props.get("event"), limit=220)
        if not title:
            continue
        sent = parse_time(props.get("sent") or props.get("effective") or props.get("onset"))
        url = props.get("@id") or props.get("id") or source["url"]
        severity = props.get("severity")
        urgency = props.get("urgency")
        items.append(
            {
                "id": item_id(source["id"], title, url),
                "lane": source["lane"],
                "scope": source["scope"],
                "source_id": source["id"],
                "source_name": source["name"],
                "source_class": source["source_class"],
                "title": title,
                "summary": clean_text(props.get("description"), limit=MAX_SUMMARY_CHARS),
                "url": url,
                "published_at": iso_z(sent) if sent else None,
                "retrieved_at": None,
                "metrics": {"severity": severity, "urgency": urgency, "area": props.get("areaDesc")},
                "confidence": "high",
            }
        )
    return items, {"count": len(items)}


def collect_hn(source: dict[str, Any], timeout: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    payload = fetch_json(source["url"], timeout)
    items = []
    for hit in payload.get("hits", [])[:20]:
        title = clean_text(hit.get("title") or hit.get("story_title"), limit=220)
        if not title:
            continue
        url = hit.get("url") or hit.get("story_url") or f"https://news.ycombinator.com/item?id={hit.get('objectID')}"
        created = parse_time(hit.get("created_at"))
        points = int(hit.get("points") or 0)
        comments = int(hit.get("num_comments") or 0)
        items.append(
            {
                "id": item_id(source["id"], title, url),
                "lane": source["lane"],
                "scope": source["scope"],
                "source_id": source["id"],
                "source_name": source["name"],
                "source_class": source["source_class"],
                "platforms": ["hacker_news"],
                "title": title,
                "summary": "",
                "url": url,
                "published_at": iso_z(created) if created else None,
                "retrieved_at": None,
                "metrics": {"points": points, "comments": comments},
                "confidence": "low",
            }
        )
    return items, {"count": len(items)}


def collect_reddit(source: dict[str, Any], timeout: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    payload = fetch_json(source["url"], timeout)
    children = payload.get("data", {}).get("children", [])
    items = []
    for child in children[:20]:
        post = child.get("data", {})
        title = clean_text(post.get("title"), limit=220)
        if not title:
            continue
        permalink = post.get("permalink")
        url = post.get("url") or (f"https://www.reddit.com{permalink}" if permalink else source["url"])
        created_utc = post.get("created_utc")
        published = datetime.fromtimestamp(created_utc, tz=timezone.utc) if created_utc else None
        subreddit = post.get("subreddit")
        items.append(
            {
                "id": item_id(source["id"], title, url),
                "lane": source["lane"],
                "scope": source["scope"],
                "source_id": source["id"],
                "source_name": source["name"],
                "source_class": source["source_class"],
                "platforms": ["reddit", f"r/{subreddit}" if subreddit else "reddit"],
                "title": title,
                "summary": clean_text(post.get("selftext"), limit=MAX_SUMMARY_CHARS),
                "url": url,
                "published_at": iso_z(published) if published else None,
                "retrieved_at": None,
                "metrics": {
                    "score": int(post.get("score") or 0),
                    "comments": int(post.get("num_comments") or 0),
                    "upvote_ratio": post.get("upvote_ratio"),
                    "subreddit": subreddit,
                },
                "confidence": "low",
            }
        )
    return items, {"count": len(items)}


def parse_json_list_field(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []
    return []


def collect_polymarket(source: dict[str, Any], timeout: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    markets = fetch_json(source["url"], timeout)
    items = []
    if not isinstance(markets, list):
        return items, {"count": 0, "note": "unexpected_payload"}
    for market in markets[:20]:
        question = clean_text(market.get("question"), limit=260)
        if not question:
            continue
        outcomes = parse_json_list_field(market.get("outcomes"))
        prices = parse_json_list_field(market.get("outcomePrices"))
        try:
            price_pairs = [f"{outcome}: {float(price) * 100:.1f}%" for outcome, price in zip(outcomes, prices)]
        except (TypeError, ValueError):
            price_pairs = []
        url_slug = market.get("slug")
        url = f"https://polymarket.com/event/{url_slug}" if url_slug else "https://polymarket.com/"
        volume24h = float(market.get("volume24hr") or market.get("volume24h") or 0.0)
        liquidity = float(market.get("liquidity") or 0.0)
        end_date = parse_time(market.get("endDate") or market.get("endDateIso"))
        items.append(
            {
                "id": item_id(source["id"], question, url),
                "lane": source["lane"],
                "scope": source["scope"],
                "source_id": source["id"],
                "source_name": source["name"],
                "source_class": source["source_class"],
                "title": question,
                "summary": "; ".join(price_pairs),
                "url": url,
                "published_at": None,
                "retrieved_at": None,
                "metrics": {
                    "volume24h": volume24h,
                    "liquidity": liquidity,
                    "outcome_prices": price_pairs,
                    "end_date": iso_z(end_date) if end_date else None,
                },
                "confidence": "medium",
            }
        )
    return items, {"count": len(items)}


def collect_coingecko_trending(source: dict[str, Any], timeout: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    payload = fetch_json(source["url"], timeout)
    items = []
    for idx, coin in enumerate(payload.get("coins", [])[:15], start=1):
        data = coin.get("item", {})
        title = clean_text(f"{data.get('name', 'Unknown')} ({data.get('symbol', '?')}) trending on CoinGecko", limit=220)
        url = f"https://www.coingecko.com/en/coins/{data.get('id')}" if data.get("id") else "https://www.coingecko.com/"
        data_blob = data.get("data") or {}
        content = data_blob.get("content") or {}
        items.append(
            {
                "id": item_id(source["id"], title, url),
                "lane": source["lane"],
                "scope": source["scope"],
                "source_id": source["id"],
                "source_name": source["name"],
                "source_class": source["source_class"],
                "title": title,
                "summary": clean_text(content.get("description"), limit=MAX_SUMMARY_CHARS),
                "url": url,
                "published_at": None,
                "retrieved_at": None,
                "metrics": {"trend_rank": idx, "market_cap_rank": data.get("market_cap_rank")},
                "confidence": "medium",
            }
        )
    return items, {"count": len(items)}


def collect_coingecko_markets(source: dict[str, Any], timeout: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    payload = fetch_json(source["url"], timeout)
    items = []
    if not isinstance(payload, list):
        return items, {"count": 0, "note": "unexpected_payload"}
    for coin in payload:
        name = coin.get("name")
        symbol = str(coin.get("symbol") or "").upper()
        price = coin.get("current_price")
        change = coin.get("price_change_percentage_24h")
        updated = parse_time(coin.get("last_updated"))
        title = clean_text(f"{name} ({symbol}) 24h move: {change:.2f}%" if isinstance(change, (int, float)) else f"{name} ({symbol}) market snapshot", limit=220)
        items.append(
            {
                "id": item_id(source["id"], title, str(coin.get("id"))),
                "lane": source["lane"],
                "scope": source["scope"],
                "source_id": source["id"],
                "source_name": source["name"],
                "source_class": source["source_class"],
                "title": title,
                "summary": f"Price ${price}; 24h change {change}%" if price is not None else "",
                "url": f"https://www.coingecko.com/en/coins/{coin.get('id')}",
                "published_at": iso_z(updated) if updated else None,
                "retrieved_at": None,
                "metrics": {
                    "current_price": price,
                    "price_change_percentage_24h": change,
                    "market_cap_rank": coin.get("market_cap_rank"),
                    "total_volume": coin.get("total_volume"),
                },
                "confidence": "medium",
            }
        )
    return items, {"count": len(items)}


def collect_json_source(source: dict[str, Any], timeout: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    kind = source["kind"]
    if kind == "nws_alerts":
        return collect_nws_alerts(source, timeout)
    if kind == "hn_algolia":
        return collect_hn(source, timeout)
    if kind == "reddit_listing":
        return collect_reddit(source, timeout)
    if kind == "polymarket_markets":
        return collect_polymarket(source, timeout)
    if kind == "coingecko_trending":
        return collect_coingecko_trending(source, timeout)
    if kind == "coingecko_markets":
        return collect_coingecko_markets(source, timeout)
    return [], {"count": 0, "note": f"unsupported_kind:{kind}"}


def source_fetch_error(exc: Exception) -> dict[str, Any]:
    if isinstance(exc, HTTPError):
        return {"type": "http", "status": exc.code, "reason": str(exc)}
    if isinstance(exc, URLError):
        return {"type": "url", "reason": str(exc.reason)}
    return {"type": exc.__class__.__name__, "reason": str(exc)}


def age_hours(item: dict[str, Any], now: datetime) -> float:
    published = parse_time(item.get("published_at"))
    if not published:
        return 999.0
    return max(0.0, (now - published).total_seconds() / 3600.0)


def keyword_score(text: str) -> float:
    lowered = text.lower()
    score = 0.0
    for keyword, weight in MATERIALITY_KEYWORDS.items():
        if keyword in lowered:
            score += weight
    return score


def scope_boost(scope: str) -> float:
    return {
        "washington_state": 8.0,
        "operator_context": 6.0,
        "us": 4.0,
        "global": 1.0,
        "market": 2.0,
    }.get(scope, 0.0)


def recency_score(item: dict[str, Any], now: datetime) -> float:
    hours = age_hours(item, now)
    if hours >= 999:
        return 0.5
    return max(0.0, 8.0 - min(hours, 48.0) / 6.0)


def source_quality_score(source_class: str) -> float:
    if source_class.startswith("official"):
        return 5.0
    if source_class in {"local_news", "national_news", "tech_news"}:
        return 3.0
    if source_class == "news_aggregator":
        return 2.0
    return 1.0


def engagement_score(metrics: dict[str, Any]) -> float:
    values = []
    for key in ("score", "comments", "points"):
        value = metrics.get(key)
        if isinstance(value, (int, float)) and value > 0:
            values.append(math.log10(value + 1.0))
    for key in ("volume24h", "liquidity", "total_volume"):
        value = metrics.get(key)
        if isinstance(value, (int, float)) and value > 0:
            values.append(math.log10(value + 1.0) / 2.0)
    if "trend_rank" in metrics and isinstance(metrics["trend_rank"], int):
        values.append(max(0.0, 6.0 - metrics["trend_rank"] * 0.5))
    change = metrics.get("price_change_percentage_24h")
    if isinstance(change, (int, float)):
        values.append(min(abs(change) / 3.0, 5.0))
    return sum(values)


def score_item(item: dict[str, Any], now: datetime) -> float:
    text = f"{item.get('title', '')} {item.get('summary', '')}"
    base = scope_boost(item.get("scope", "")) + keyword_score(text) + recency_score(item, now)
    base += source_quality_score(item.get("source_class", ""))
    if item.get("lane") in {"murmurs", "bridge"}:
        base += engagement_score(item.get("metrics", {}))
    return round(base, 3)


def dedupe_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for item in items:
        key = re.sub(r"[^a-z0-9]+", " ", item.get("title", "").lower()).strip()[:120]
        url = item.get("url") or ""
        composite = key or url
        if composite in seen:
            continue
        seen.add(composite)
        deduped.append(item)
    return deduped


def load_ledger(path: Path) -> tuple[dict[str, Any], bool]:
    if not path.exists():
        return engine_default_ledger(utc_now()), False
    with path.open("r", encoding="utf-8") as handle:
        loaded = json.load(handle)
    return loaded if isinstance(loaded, dict) else engine_default_ledger(utc_now()), True


def load_paper_actions(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    actions = state.get("last_paper_action_candidates") if isinstance(state, dict) else None
    return [action for action in (actions or []) if isinstance(action, dict)]


def position_mark_value(position: dict[str, Any], price_key: str) -> float | None:
    quantity = float(position.get("quantity") or position.get("units") or 0.0)
    price = position.get(price_key)
    if price is None:
        return None
    price_value = float(price)
    side = str(position.get("side") or "long").lower()
    if side in {"short", "no"}:
        price_value = 1.0 - price_value if 0.0 <= price_value <= 1.0 else -price_value
    return quantity * price_value


def summarize_books(ledger: dict[str, Any], ledger_path: Path, ledger_loaded: bool) -> list[dict[str, Any]]:
    raw_books = [book for book in ledger.get("books", []) if isinstance(book, dict)]
    normalized = engine_migrate_ledger(ledger if raw_books else DEFAULT_LEDGER_DATA, utc_now())
    books = normalized.get("books", [])

    summaries: list[dict[str, Any]] = []
    for book in books:
        summary = engine_summarize_book(book)
        summaries.append(
            {
                "bookId": summary["book_id"],
                "lineId": summary.get("line_id"),
                "lineName": summary.get("line_display_name"),
                "strategyId": summary.get("strategy_id"),
                "strategyName": summary.get("strategy_display_name"),
                "displayName": summary["display_name"],
                "startingBalance": summary["starting_balance"],
                "cashBalance": summary["cash_balance"],
                "equity": summary["equity"],
                "openPositionCount": summary["open_position_count"],
                "grossPaperExposure": summary["gross_paper_exposure"],
                "dailyPnl": summary["daily_pnl"],
                "dailyPnlPct": summary["daily_pnl_pct"],
                "realizedPnl": summary["realized_pnl"],
                "unrealizedPnl": summary["unrealized_pnl"],
                "cumulativePnl": summary["cumulative_pnl"],
                "cumulativePnlPct": summary["cumulative_pnl_pct"],
                "drawdownPct": summary["drawdown_pct"],
                "maxDrawdownPct": summary["max_drawdown_pct"],
                "status": summary["status"],
                "postmortemRequired": summary.get("postmortem_required", False),
                "crashedAt": summary.get("crashed_at"),
                "staleOpenMarks": summary["stale_open_marks"],
                "initialAllocationComplete": bool(book.get("initial_allocation_complete")),
                "ledgerLoaded": ledger_loaded,
                "ledgerPath": str(ledger_path),
                "newActions": "none",
            }
        )
    return summaries


def compact_item(item: dict[str, Any]) -> dict[str, Any]:
    compact = {
        "id": item.get("id"),
        "lane": item.get("lane"),
        "scope": item.get("scope"),
        "score": item.get("score"),
        "title": item.get("title"),
        "summary": item.get("summary"),
        "source": item.get("source_name"),
        "source_class": item.get("source_class"),
        "published_at": item.get("published_at"),
        "url": item.get("url"),
        "metrics": item.get("metrics") or {},
        "confidence": item.get("confidence"),
    }
    if item.get("platforms"):
        compact["platforms"] = item.get("platforms")
    return compact


def build_delivery_markdown(manifest: dict[str, Any]) -> str:
    """Create the deterministic, provenance-preserving text artifact consumed by the renderer."""
    inputs = manifest.get("brief_inputs") or {}
    lines = [
        "# Mosaic & Murmurs Morning Brief",
        "",
        f"Run: `{clean_text(manifest.get('run_id'), 80)}`",
        f"Generated: {clean_text(manifest.get('generated_at_local'), 80)}",
        f"Window: {clean_text((manifest.get('window') or {}).get('start'), 80)} → {clean_text((manifest.get('window') or {}).get('end'), 80)}",
    ]

    def append_lane(title: str, records: list[dict[str, Any]]) -> None:
        lines.extend(["", f"## {title}"])
        if not records:
            lines.append("- No reportable entries in this validated collection window.")
            return
        for record in records:
            name = clean_text(record.get("title"), 180) or "Untitled record"
            source = clean_text(record.get("source"), 100) or "unknown source"
            summary = clean_text(record.get("summary"), 420) or "No additional annotation."
            url = clean_text(record.get("url"), 500)
            lines.append(f"- **{name}** — {source}")
            lines.append(f"  {summary}")
            if url.startswith("https://"):
                lines.append(f"  Source: {url}")

    append_lane("Mosaic", list(inputs.get("breaking_reality") or []))
    append_lane("Murmurs / Bridge", list(inputs.get("hype_weather") or []) + list(inputs.get("market_signals") or []))

    lines.extend(["", "## Paper matrix"])
    books = list(inputs.get("paper_books") or [])
    if not books:
        lines.append("- No paper-book summary is available.")
    else:
        for book in books:
            display_name = clean_text(book.get("displayName"), 140) or "Unnamed book"
            status = clean_text(book.get("status"), 48) or "unknown"
            equity = book.get("equity")
            lines.append(f"- {display_name}: {status}; equity {equity}.")

    lines.extend(["", "## Governance", "- Paper-only; autonomous paper execution; no real-money execution.", ""])
    return "\n".join(lines)


def build_manifest(args: argparse.Namespace) -> dict[str, Any]:
    tz = ZoneInfo(args.timezone) if ZoneInfo else timezone.utc
    generated_at = utc_now()
    local_generated = generated_at.astimezone(tz)
    runtime_dir = Path(args.output_dir).expanduser()
    runtime_dir.mkdir(parents=True, exist_ok=True)
    state_path = Path(args.state).expanduser()
    previous_generated: datetime | None = None
    if state_path.exists():
        try:
            state = json.loads(state_path.read_text(encoding="utf-8"))
            previous_generated = parse_time(state.get("last_generated_at"))
        except (OSError, json.JSONDecodeError):
            previous_generated = None
    window_start = previous_generated or (generated_at - timedelta(hours=args.window_hours))

    items: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    source_counts: dict[str, int] = {}
    started = time.monotonic()

    for source in RSS_SOURCES:
        try:
            collected, meta = collect_rss(source, args.timeout)
            for item in collected:
                item["retrieved_at"] = iso_z(generated_at)
            items.extend(collected)
            source_counts[source["id"]] = int(meta.get("count", 0))
        except Exception as exc:  # source failure should not fail the whole brief.
            source_counts[source["id"]] = 0
            errors.append({"source_id": source["id"], "source_name": source["name"], **source_fetch_error(exc)})

    for source in JSON_SOURCES:
        try:
            collected, meta = collect_json_source(source, args.timeout)
            for item in collected:
                item["retrieved_at"] = iso_z(generated_at)
            items.extend(collected)
            source_counts[source["id"]] = int(meta.get("count", 0))
        except Exception as exc:
            source_counts[source["id"]] = 0
            errors.append({"source_id": source["id"], "source_name": source["name"], **source_fetch_error(exc)})

    items = dedupe_items(items)
    for item in items:
        item["score"] = score_item(item, generated_at)

    news_items = sorted(
        [item for item in items if item.get("lane") == "mosaic"],
        key=lambda entry: entry.get("score", 0),
        reverse=True,
    )
    hype_items = sorted(
        [item for item in items if item.get("lane") in {"murmurs", "bridge"}],
        key=lambda entry: entry.get("score", 0),
        reverse=True,
    )
    market_items = sorted(
        [item for item in items if item.get("lane") == "bridge"],
        key=lambda entry: entry.get("score", 0),
        reverse=True,
    )

    ledger_path = Path(args.ledger).expanduser()
    ledger, ledger_loaded = load_ledger(ledger_path)
    books = summarize_books(ledger, ledger_path, ledger_loaded)
    paper_actions = load_paper_actions(Path(args.paper_state).expanduser())

    run_id = f"morning-brief-{local_generated.strftime('%Y-%m-%d')}"
    manifest = {
        "schema_version": 1,
        "run_id": run_id,
        "timezone": args.timezone,
        "generated_at": iso_z(generated_at),
        "generated_at_local": local_generated.replace(microsecond=0).isoformat(),
        "window": {"start": iso_z(window_start), "end": iso_z(generated_at)},
        "source_counts": source_counts,
        "source_errors": errors,
        "collector_seconds": round(time.monotonic() - started, 3),
        "ledger": {
            "path": str(ledger_path),
            "loaded": ledger_loaded,
            "updated_at": ledger.get("updated_at"),
        },
        "brief_inputs": {
            "breaking_reality": [compact_item(item) for item in news_items[: args.news_limit]],
            "hype_weather": [compact_item(item) for item in hype_items[: args.hype_limit]],
            "market_signals": [compact_item(item) for item in market_items[: args.market_limit]],
            "paper_books": books,
            "paper_action_candidates": paper_actions,
        },
        "raw_item_count": len(items),
        "all_items": [compact_item(item) for item in sorted(items, key=lambda entry: entry.get("score", 0), reverse=True)],
        "governance": {
            "paper_only": True,
            "autonomous_paper_execution": True,
            "human_review_required_for_actions": False,
            "no_real_money_execution": True,
            "new_orders_suppressed_when_market_data_stale": True,
        },
    }

    output_path = runtime_dir / f"{run_id}.json"
    delivery_path = runtime_dir / f"{run_id}.md"
    manifest["manifest_path"] = str(output_path)
    manifest["delivery_path"] = str(delivery_path)
    output_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    delivery_path.write_text(build_delivery_markdown(manifest), encoding="utf-8")
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(
        json.dumps(
            {
                "last_generated_at": iso_z(generated_at),
                "last_manifest_path": str(output_path),
                "last_run_id": run_id,
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    return manifest


def cron_packet(manifest: dict[str, Any]) -> dict[str, Any]:
    inputs = manifest["brief_inputs"]
    return {
        "run_id": manifest["run_id"],
        "generated_at_local": manifest["generated_at_local"],
        "window": manifest["window"],
        "manifest_path": manifest["manifest_path"],
        "source_counts": manifest["source_counts"],
        "source_error_count": len(manifest.get("source_errors", [])),
        "source_errors": manifest.get("source_errors", [])[:6],
        "breaking_reality": inputs["breaking_reality"],
        "hype_weather": inputs["hype_weather"],
        "market_signals": inputs["market_signals"],
        "paper_books": inputs["paper_books"],
        "paper_action_candidates": inputs["paper_action_candidates"],
        "governance": manifest["governance"],
    }


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--timezone", default="America/Los_Angeles")
    parser.add_argument("--output-dir", default=str(DEFAULT_RUNTIME_DIR / "runs"))
    parser.add_argument("--state", default=str(DEFAULT_RUNTIME_DIR / "state.json"))
    parser.add_argument("--ledger", default=str(DEFAULT_LEDGER))
    parser.add_argument("--paper-state", default=str(DEFAULT_PAPER_STATE))
    parser.add_argument("--window-hours", type=int, default=24)
    parser.add_argument("--timeout", type=int, default=12)
    parser.add_argument("--news-limit", type=int, default=10)
    parser.add_argument("--hype-limit", type=int, default=10)
    parser.add_argument("--market-limit", type=int, default=10)
    parser.add_argument("--full", action="store_true", help="Print the full manifest instead of the compact cron packet")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    manifest = build_manifest(args)
    payload = manifest if args.full else cron_packet(manifest)
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
