#!/usr/bin/env python3
"""Canonical paper-state envelope and authenticated VM synchronization helpers."""

from __future__ import annotations

import copy
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


class PaperSyncError(RuntimeError):
    pass


def iso_z(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def build_paper_state(
    ledger: dict[str, Any],
    paper_books: list[dict[str, Any]],
    actions: list[dict[str, Any]],
    events: list[dict[str, Any]],
    generated_at: datetime,
) -> dict[str, Any]:
    return {
        "schema_version": "bss.paper_state.v1",
        "generated_at": iso_z(generated_at),
        "paper_only": True,
        "autonomous_execution": True,
        "ledger": copy.deepcopy(ledger),
        "paper_books": copy.deepcopy(paper_books),
        "paper_action_candidates": copy.deepcopy(actions),
        "paper_ledger_events": copy.deepcopy(events),
        "governance": {
            "paper_only": True,
            "autonomous_paper_execution": True,
            "human_review_required_for_actions": False,
            "no_real_money_execution": True,
            "stale_marks_block_new_buys": True,
        },
    }


def read_token_file(path: str | Path | None) -> str:
    if not path:
        return ""
    token_path = Path(path).expanduser()
    try:
        token = token_path.read_text(encoding="utf-8").strip()
    except OSError as exc:
        raise PaperSyncError(f"paper state token file is unavailable: {token_path}") from exc
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
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise PaperSyncError("paper state URL must be an HTTP(S) endpoint without embedded credentials")
    if len(token) < 32 or len(token) > 256:
        raise PaperSyncError("paper state token must contain 32-256 characters")
    if not idempotency_key or len(idempotency_key) > 200:
        raise PaperSyncError("paper state idempotency key must contain 1-200 characters")
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
            return {
                "ok": 200 <= int(response.status) < 300,
                "status": int(response.status),
                "replayed": str(response.headers.get("Idempotent-Replayed", "false")).lower() == "true",
                "body": body,
            }
    except HTTPError as exc:
        raise PaperSyncError(f"paper state backend rejected the snapshot with HTTP {exc.code}") from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise PaperSyncError(f"paper state backend is unavailable: {type(exc).__name__}") from exc
