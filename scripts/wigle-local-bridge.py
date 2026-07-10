#!/usr/bin/env python3
"""Serve a device-local WiGLE sqlite database as /api/wigle?mode=current.

This bridge is for the AR path: WiGLE performs Wi-Fi scanning; this process only
reads WiGLE's local sqlite rows and exposes the newest observations as JSON.
"""

from __future__ import annotations

import argparse
import json
import math
import sqlite3
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

DEFAULT_MAX_AGE_MS = 45_000
DEFAULT_LIMIT = 12
SOURCE = "device-local-wigle-sqlite"


def query_current_state(
    db_path: str | Path,
    *,
    now_ms: int | float | None = None,
    max_age_ms: int | float = DEFAULT_MAX_AGE_MS,
    limit: int = DEFAULT_LIMIT,
    lat: float | None = None,
    lon: float | None = None,
    radius_meters: float | None = None,
) -> dict[str, Any]:
    """Return newest unique WiGLE observations that are recent enough for AR."""

    db_path = Path(db_path).expanduser().resolve()
    now_ms = int(now_ms if now_ms is not None else time.time() * 1000)
    max_age_ms = max(0, int(max_age_ms))
    limit = max(0, int(limit))
    cutoff_ms = now_ms - max_age_ms

    with _connect_readonly(db_path) as conn:
        rows = _query_location_rows(conn, cutoff_ms, max(limit * 4, limit, DEFAULT_LIMIT))
        if not rows:
            rows = _query_network_rows(conn, cutoff_ms, max(limit * 4, limit, DEFAULT_LIMIT))
        route_location = _query_latest_route(conn)

    records = [_row_to_record(row, now_ms) for row in rows]
    if lat is not None and lon is not None and radius_meters is not None:
        records = [
            record
            for record in records
            if _distance_meters(lat, lon, record["lat"], record["lon"]) <= radius_meters
        ]

    records.sort(key=lambda record: (_signal_sort(record), -record["ageMs"], record.get("ssid") or ""))
    records = records[:limit]
    latest_seen = max((record["lastSeenMs"] for record in records), default=now_ms)

    for record in records:
        record.pop("lastSeenMs", None)

    location = {"lat": lat, "lon": lon} if lat is not None and lon is not None else route_location

    return {
        "ok": True,
        "mode": "current",
        "live": bool(records),
        "current": bool(records),
        "source": SOURCE,
        "location": location,
        "radiusMeters": radius_meters if lat is not None and lon is not None else None,
        "maxAgeMs": max_age_ms,
        "totalResults": len(records),
        "accessPoints": records,
        "updatedAt": _iso_from_ms(latest_seen),
        "message": "Current local WiGLE observations ready." if records else "No recent WiGLE observations found.",
    }


def _connect_readonly(db_path: Path) -> sqlite3.Connection:
    uri = f"file:{db_path.as_posix()}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def _query_location_rows(conn: sqlite3.Connection, cutoff_ms: int, limit: int) -> list[sqlite3.Row]:
    try:
        return conn.execute(
            """
            with latest as (
              select bssid, max(_id) as latest_id
              from location
              where time >= ? and external = 0
              group by bssid
            )
            select
              n.bssid,
              n.ssid,
              n.frequency,
              n.capabilities,
              n.type,
              l.level as signalDbm,
              l.lat,
              l.lon,
              l.altitude,
              l.accuracy,
              l.time as lastSeenMs
            from latest
            join location l on l._id = latest.latest_id
            left join network n on n.bssid = latest.bssid
            order by l.level desc, l.time desc
            limit ?
            """,
            (cutoff_ms, limit),
        ).fetchall()
    except sqlite3.OperationalError:
        return []


def _query_network_rows(conn: sqlite3.Connection, cutoff_ms: int, limit: int) -> list[sqlite3.Row]:
    try:
        return conn.execute(
            """
            select
              bssid,
              ssid,
              frequency,
              capabilities,
              type,
              bestlevel as signalDbm,
              lastlat as lat,
              lastlon as lon,
              null as altitude,
              null as accuracy,
              lasttime as lastSeenMs
            from network
            where lasttime >= ?
            order by bestlevel desc, lasttime desc
            limit ?
            """,
            (cutoff_ms, limit),
        ).fetchall()
    except sqlite3.OperationalError:
        return []


def _query_latest_route(conn: sqlite3.Connection) -> dict[str, Any] | None:
    try:
        row = conn.execute(
            """
            select lat, lon, accuracy, altitude, time
            from route
            order by time desc
            limit 1
            """
        ).fetchone()
    except sqlite3.OperationalError:
        return None

    if row is None:
        return None

    return {
        "lat": row["lat"],
        "lon": row["lon"],
        "accuracy": row["accuracy"],
        "altitude": row["altitude"],
        "timestamp": _iso_from_ms(row["time"]),
    }


def _row_to_record(row: sqlite3.Row, now_ms: int) -> dict[str, Any]:
    last_seen_ms = int(row["lastSeenMs"])
    age_ms = max(0, now_ms - last_seen_ms)
    signal = row["signalDbm"]
    return {
        "ssid": row["ssid"] or None,
        "bssid": row["bssid"],
        "frequency": row["frequency"],
        "security": row["capabilities"] or None,
        "deviceClass": row["type"] or "W",
        "signalDbm": signal,
        "lat": row["lat"],
        "lon": row["lon"],
        "altitude": row["altitude"],
        "accuracy": row["accuracy"],
        "lastSeen": _iso_from_ms(last_seen_ms),
        "lastSeenMs": last_seen_ms,
        "ageMs": age_ms,
        "current": True,
        "source": SOURCE,
    }


def _signal_sort(record: dict[str, Any]) -> float:
    signal = record.get("signalDbm")
    return -(signal if isinstance(signal, (int, float)) else -9999)


def _iso_from_ms(value: int | float) -> str:
    return datetime.fromtimestamp(value / 1000, tz=timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6_371_000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _first_float(params: dict[str, list[str]], name: str) -> float | None:
    try:
        values = params.get(name)
        return float(values[0]) if values and values[0] != "" else None
    except (TypeError, ValueError):
        return None


def _first_int(params: dict[str, list[str]], name: str, fallback: int) -> int:
    try:
        values = params.get(name)
        return int(float(values[0])) if values and values[0] != "" else fallback
    except (TypeError, ValueError):
        return fallback


def make_handler(db_path: Path, default_max_age_ms: int, default_limit: int) -> type[BaseHTTPRequestHandler]:
    class WigleHandler(BaseHTTPRequestHandler):
        def do_OPTIONS(self) -> None:  # noqa: N802
            self._send_json(204, None)

        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            if parsed.path not in {"/api/wigle", "/wigle", "/"}:
                self._send_json(404, {"ok": False, "message": "Not found"})
                return

            params = parse_qs(parsed.query)
            max_age_seconds = _first_float(params, "maxAgeSeconds")
            max_age_ms = _first_int(
                params,
                "maxAgeMs",
                int(max_age_seconds * 1000) if max_age_seconds is not None else default_max_age_ms,
            )
            limit = _first_int(params, "limit", default_limit)
            now = params.get("now", [None])[0]
            now_ms = _parse_now(now)

            try:
                snapshot = query_current_state(
                    db_path,
                    now_ms=now_ms,
                    max_age_ms=max_age_ms,
                    limit=limit,
                    lat=_first_float(params, "lat"),
                    lon=_first_float(params, "lon"),
                    radius_meters=_first_float(params, "radiusMeters"),
                )
                self._send_json(200, snapshot)
            except Exception as error:  # pragma: no cover - defensive HTTP boundary
                self._send_json(500, {"ok": False, "mode": "current", "live": False, "message": str(error)})

        def log_message(self, format: str, *args: Any) -> None:
            return

        def _send_json(self, status: int, body: dict[str, Any] | None) -> None:
            self.send_response(status)
            self.send_header("content-type", "application/json; charset=utf-8")
            self.send_header("cache-control", "no-store")
            self.send_header("access-control-allow-origin", "*")
            self.send_header("access-control-allow-methods", "GET, OPTIONS")
            self.send_header("access-control-allow-headers", "content-type, accept")
            self.end_headers()
            if body is not None:
                self.wfile.write(json.dumps(body, separators=(",", ":")).encode("utf-8"))

    return WigleHandler


def _parse_now(value: str | None) -> int | None:
    if not value:
        return None
    try:
        numeric = float(value)
        return int(numeric if abs(numeric) >= 1_000_000_000_000 else numeric * 1000)
    except ValueError:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return int(parsed.timestamp() * 1000)


def main() -> None:
    parser = argparse.ArgumentParser(description="Expose a WiGLE sqlite DB as a current-state JSON endpoint.")
    parser.add_argument("--db", required=True, type=Path, help="Path to WiGLE sqlite DB/export readable by this process")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8787, type=int)
    parser.add_argument("--max-age-seconds", default=45, type=int)
    parser.add_argument("--limit", default=12, type=int)
    args = parser.parse_args()

    handler = make_handler(args.db, args.max_age_seconds * 1000, args.limit)
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"WiGLE local bridge listening on http://{args.host}:{args.port}/api/wigle", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
