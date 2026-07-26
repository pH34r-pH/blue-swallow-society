#!/usr/bin/env python3
"""Extract a Planetiler MBTiles archive into an immutable XYZ vector-tile tree."""

import argparse
import gzip
import json
import sqlite3
from pathlib import Path

REQUIRED_SOURCE_LAYERS = {"water", "transportation"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("mbtiles", type=Path)
    parser.add_argument("output_directory", type=Path)
    parser.add_argument("--receipt", type=Path, required=True)
    return parser.parse_args()


def metadata(connection: sqlite3.Connection) -> dict[str, str]:
    return dict(connection.execute("SELECT name, value FROM metadata"))


def main() -> None:
    args = parse_args()
    if not args.mbtiles.is_file():
        raise SystemExit(f"MBTiles archive does not exist: {args.mbtiles}")

    args.output_directory.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(args.mbtiles)
    try:
        values = metadata(connection)
        if values.get("format") != "pbf":
            raise SystemExit(f"Expected pbf tiles, found {values.get('format')!r}")
        style_metadata = json.loads(values.get("json", "{}"))
        source_layers = {layer["id"] for layer in style_metadata.get("vector_layers", [])}
        missing = REQUIRED_SOURCE_LAYERS - source_layers
        if missing:
            raise SystemExit(f"Tile archive lacks required source layers: {', '.join(sorted(missing))}")

        tile_count = 0
        sample_tile = None
        min_zoom = None
        max_zoom = None
        for zoom, column, tms_row, data in connection.execute(
            "SELECT zoom_level, tile_column, tile_row, tile_data FROM tiles ORDER BY zoom_level, tile_column, tile_row"
        ):
            if not data.startswith(b"\x1f\x8b"):
                raise SystemExit("Planetiler tile data is not gzip-compressed; refusing an incorrect Content-Encoding")
            # MBTiles uses TMS y. MapLibre style URLs use XYZ y unless `scheme: tms` is set.
            xyz_row = (1 << zoom) - 1 - tms_row
            destination = args.output_directory / str(zoom) / str(column) / f"{xyz_row}.pbf"
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
            tile_count += 1
            min_zoom = zoom if min_zoom is None else min(min_zoom, zoom)
            max_zoom = zoom if max_zoom is None else max(max_zoom, zoom)
            if sample_tile is None:
                # Validate the archived tile is well-formed gzip before publication.
                gzip.decompress(data)
                sample_tile = {"z": zoom, "x": column, "y": xyz_row}

        if tile_count == 0 or sample_tile is None:
            raise SystemExit("Planetiler generated no vector tiles")

        receipt = {
            "schemaVersion": 1,
            "tileCount": tile_count,
            "minZoom": min_zoom,
            "maxZoom": max_zoom,
            "sourceLayers": sorted(source_layers),
            "sampleTile": sample_tile,
            "contentEncoding": "gzip",
        }
        args.receipt.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
