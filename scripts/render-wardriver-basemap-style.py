#!/usr/bin/env python3
"""Render the public BSS MapLibre style from a checked-in tile-base template."""

import argparse
import json
from pathlib import Path
from urllib.parse import urlparse

PLACEHOLDER = "__BSS_TILE_BASE_URL__"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--template", type=Path, required=True)
    parser.add_argument("--tile-base-url", required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def validate_tile_base_url(value: str) -> str:
    value = value.rstrip("/")
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(".blob.core.windows.net"):
        raise SystemExit("tile base URL must use an HTTPS Azure Blob endpoint")
    if not parsed.path.startswith("/wardriver-basemap/") or not parsed.path.endswith("/tiles"):
        raise SystemExit("tile base URL must address the public wardriver-basemap container and a generation tiles path")
    if parsed.query or parsed.fragment:
        raise SystemExit("tile base URL must not contain credentials or query data")
    return value


def main() -> None:
    args = parse_args()
    tile_base_url = validate_tile_base_url(args.tile_base_url)
    text = args.template.read_text(encoding="utf-8")
    if text.count(PLACEHOLDER) != 1:
        raise SystemExit("style template must contain exactly one tile-base placeholder")
    rendered = text.replace(PLACEHOLDER, tile_base_url)
    style = json.loads(rendered)
    tiles = style.get("sources", {}).get("bss-basemap", {}).get("tiles")
    if tiles != [f"{tile_base_url}/{{z}}/{{x}}/{{y}}.pbf"]:
        raise SystemExit("rendered style did not preserve the BSS tile source contract")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(style, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
