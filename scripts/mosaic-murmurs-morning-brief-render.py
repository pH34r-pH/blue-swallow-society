#!/usr/bin/env python3
"""Deterministically render and validate Mosaic & Murmurs Field Dossier packages.

The renderer has no network side effects. It produces an immutable local package that
another transport may archive and dispatch only after validation succeeds.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

PNG_SIZE = (1200, 1500)
MAX_CANONICAL_AGE = timedelta(hours=3)
REQUIRED_LANES = (
    "MOSAIC / FACT LANE",
    "MURMURS / PERCEPTION LANE",
    "BRIDGE / DELTA LANE",
    "SOURCE QUARANTINE",
    "PAPER ACTIONS / LEDGER",
    "PAPER BOOKS / LEDGER",
    "SOURCE MANIFEST / CAVEATS",
)
LANES = (
    ("mosaic", "MOSAIC / FACT LANE", "Breaking reality", "breaking_reality"),
    ("murmurs", "MURMURS / PERCEPTION LANE", "Hype weather", "hype_weather"),
    ("bridge", "BRIDGE / DELTA LANE", "Perceptual deltas", "market_signals"),
    ("source_quarantine", "SOURCE QUARANTINE", "Source registry & quarantine", "source_errors"),
    ("paper_actions", "PAPER ACTIONS / LEDGER", "Paper actions", "paper_action_candidates"),
    ("paper_books", "PAPER BOOKS / LEDGER", "Paper books", "paper_books"),
    ("source_manifest", "SOURCE MANIFEST / CAVEATS", "Source manifest & caveats", "source_counts"),
)
LOCAL_PATH_RE = re.compile(r"(?<![A-Za-z0-9_.-])/(?:home|tmp|var|opt|etc)/[^\s<>'\"]+")


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def sha256(value: bytes | str) -> str:
    return hashlib.sha256(value.encode("utf-8") if isinstance(value, str) else value).hexdigest()


def iso_z(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_time(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc)


def sanitize(value: Any) -> Any:
    if isinstance(value, str):
        return LOCAL_PATH_RE.sub("[local-path-redacted]", value)
    if isinstance(value, list):
        return [sanitize(item) for item in value]
    if isinstance(value, dict):
        return {str(key): sanitize(item) for key, item in value.items()}
    return value


def validate_run(manifest: dict[str, Any], wake_receipt: dict[str, Any], *, now: datetime | None = None) -> dict[str, Any]:
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    reasons: list[str] = []
    if not isinstance(manifest, dict) or not isinstance(wake_receipt, dict):
        return {"status": "withheld", "reasons": ["invalid_run_inputs"]}
    if wake_receipt.get("ok") is not True:
        reasons.append("wake_not_successful")
    canonical = wake_receipt.get("canonical_paper_state")
    if not isinstance(canonical, dict):
        reasons.append("canonical_state_missing")
    generated = parse_time(manifest.get("generated_at"))
    if generated is None:
        reasons.append("manifest_timestamp_invalid")
    elif generated > current + timedelta(minutes=5) or current - generated > MAX_CANONICAL_AGE:
        reasons.append("manifest_stale")
    canonical_at = parse_time(canonical.get("generated_at")) if isinstance(canonical, dict) else None
    receipt_at = parse_time(wake_receipt.get("updated_at"))
    reference_at = canonical_at or receipt_at
    if reference_at is None:
        reasons.append("canonical_timestamp_missing")
    elif reference_at > current + timedelta(minutes=5) or current - reference_at > MAX_CANONICAL_AGE:
        reasons.append("canonical_state_stale")
    if reasons:
        return {
            "status": "withheld",
            "reasons": reasons,
            "run_id": sanitize(manifest.get("run_id")),
            "validated_at": iso_z(current),
        }
    canonical_hash = sha256(canonical_json(canonical))
    expected_hash = wake_receipt.get("canonical_state_hash")
    if expected_hash and expected_hash != canonical_hash:
        return {
            "status": "withheld",
            "reasons": ["canonical_state_hash_mismatch"],
            "run_id": sanitize(manifest.get("run_id")),
            "validated_at": iso_z(current),
        }
    return {
        "status": "validated",
        "reasons": [],
        "run_id": sanitize(manifest.get("run_id")),
        "validated_at": iso_z(current),
        "canonical_state_hash": canonical_hash,
        "canonical_generated_at": iso_z(reference_at),
    }


def _records_for_lane(manifest: dict[str, Any], source_key: str) -> list[dict[str, Any]]:
    if source_key == "source_errors":
        records = manifest.get("source_errors") or []
    elif source_key == "source_counts":
        records = [
            {"title": str(name), "summary": f"{count} items accepted by the collector."}
            for name, count in sorted((manifest.get("source_counts") or {}).items())
        ]
    else:
        records = ((manifest.get("brief_inputs") or {}).get(source_key) or [])
    normalized: list[dict[str, Any]] = []
    for value in records:
        if isinstance(value, dict):
            item = sanitize(value)
            normalized.append({
                "title": str(item.get("title") or item.get("displayName") or item.get("source_id") or item.get("book_id") or item.get("instrument_ref") or "Record"),
                "summary": str(item.get("summary") or item.get("thesis") or item.get("message") or item.get("status") or "No additional annotation."),
                "source": str(item.get("source") or item.get("source_name") or item.get("source_id") or item.get("url") or "ledger"),
                "url": str(item.get("url") or item.get("source_url") or ""),
                "confidence": str(item.get("confidence") or item.get("status") or "record"),
            })
    return normalized or [{"title": "No reportable entries", "summary": "No record qualified for this lane in this validated run.", "source": "collector", "url": "", "confidence": "empty"}]


def build_pages(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    pages = [{
        "section": "dispatch",
        "lane": "DISPATCH / 00",
        "title": "Morning dispatch",
        "records": [{
            "title": "Validated operator packet",
            "summary": "A bounded decision packet. Evidence, perception, and paper state remain separate.",
            "source": "Mosaic & Murmurs",
            "url": "",
            "confidence": "validated",
        }],
    }]
    for section, lane, title, source_key in LANES:
        records = _records_for_lane(manifest, source_key)
        for index in range(0, len(records), 4):
            suffix = "" if index == 0 else " / continued"
            pages.append({"section": section, "lane": lane, "title": f"{title}{suffix}", "records": records[index:index + 4]})
    for index, page in enumerate(pages, start=1):
        page["page"] = index
    return pages


def _font(size: int, *, serif: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = (
        ["/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf", "/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf"]
        if serif else ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"]
    )
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, width: int) -> list[str]:
    words = text.split()
    if not words:
        return [""]
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if draw.textbbox((0, 0), candidate, font=font)[2] <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def render_png(page: dict[str, Any], manifest: dict[str, Any], output: Path, total_pages: int) -> None:
    image = Image.new("RGB", PNG_SIZE, "#20221f")
    draw = ImageDraw.Draw(image)
    width, height = PNG_SIZE
    # Nacre interference: low-amplitude lines that stay operationally quiet.
    for offset in range(-height, width, 27):
        draw.line((offset, 0, offset + height, height), fill="#242823", width=1)
    for x, y, sx, sy in ((24, 24, 18, 18), (1158, 24, -18, 18), (24, 1476, 18, -18), (1158, 1476, -18, -18)):
        draw.line((x, y, x + sx, y), fill="#c5cbc1", width=1)
        draw.line((x, y, x, y + sy), fill="#c5cbc1", width=1)
    mono = _font(18)
    brand = _font(30, serif=True)
    lane_font = _font(34)
    title_font = _font(40, serif=True)
    record_font = _font(24)
    body_font = _font(19)
    small = _font(16)
    paper, nacre, oxide, muted = "#e9dfc8", "#97b9af", "#ae6c4e", "#c5cbc1"
    draw.text((76, 58), "Mosaic & Murmurs", fill=paper, font=brand)
    draw.text((792, 64), "FIELD DOSSIER / OPERATOR", fill=muted, font=mono)
    draw.line((76, 108, 1124, 108), fill="#6d766d", width=1)
    draw.rectangle((76, 142, 1124, 148), fill=nacre)
    draw.text((76, 172), page["lane"], fill=paper, font=lane_font)
    draw.text((76, 226), page["title"], fill=paper, font=title_font)
    run_id = str(sanitize(manifest.get("run_id") or "unknown-run"))
    draw.text((76, 288), f"RUN {run_id}  ·  AS-OF {sanitize(manifest.get('generated_at') or 'unknown')}", fill=nacre, font=small)
    y = 346
    for ordinal, record in enumerate(page["records"], start=1):
        draw.line((76, y, 1124, y), fill="#596057", width=1)
        y += 18
        draw.text((76, y), f"{ordinal:02d}", fill=oxide, font=mono)
        draw.text((132, y), str(record["confidence"]).upper()[:22], fill=nacre, font=small)
        y += 34
        for line in _wrap(draw, str(record["title"]), record_font, 940):
            draw.text((132, y), line, fill=paper, font=record_font)
            y += 30
        y += 6
        for line in _wrap(draw, str(record["summary"]), body_font, 900):
            draw.text((132, y), line, fill="#d2cec1", font=body_font)
            y += 26
        source_line = str(record["source"])
        if record.get("url"):
            source_line += f"  ·  {record['url']}"
        for line in _wrap(draw, source_line, small, 900):
            draw.text((132, y), line, fill=nacre, font=small)
            y += 21
        y += 22
        if y > 1310:
            break
    draw.line((76, 1416, 1124, 1416), fill="#6d766d", width=1)
    draw.text((76, 1444), f"{page['lane']} · {page['page']:02d} / {total_pages:02d}", fill=muted, font=small)
    draw.text((770, 1444), "PUBLIC READ-ONLY · PAPER ONLY", fill=nacre, font=small)
    image.save(output, format="PNG", optimize=True)


def render_html(page: dict[str, Any], manifest: dict[str, Any], total_pages: int) -> str:
    records = "".join(
        "<article class=record><span class=ordinal>{ordinal:02d}</span><strong>{title}</strong><p>{summary}</p><small>{source}</small></article>".format(
            ordinal=index,
            title=html.escape(str(record["title"])),
            summary=html.escape(str(record["summary"])),
            source=html.escape(str(record["source"])),
        ) for index, record in enumerate(page["records"], start=1)
    )
    return """<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><title>{title}</title><style>
:root{{--graphite:#20221f;--paper:#e9dfc8;--nacre:#97b9af;--oxide:#ae6c4e;--hair:#596057}}*{{box-sizing:border-box}}body{{margin:0;width:1200px;height:1500px;overflow:hidden;background:var(--graphite);color:var(--paper);font:18px/1.4 system-ui,sans-serif}}main{{padding:56px 76px}}header,footer{{font:16px/1.2 monospace;letter-spacing:.08em;color:var(--nacre)}}h1{{border-top:6px solid var(--nacre);padding-top:22px;font:42px Georgia,serif}}.record{{border-top:1px solid var(--hair);padding:17px 0}}.ordinal{{color:var(--oxide);font-family:monospace;margin-right:18px}}strong{{font-size:25px}}p{{margin:8px 0;color:#d2cec1}}small{{color:var(--nacre)}}footer{{border-top:1px solid var(--hair);margin-top:24px;padding-top:15px}}</style><main><header>Mosaic &amp; Murmurs · Field dossier / operator</header><h1>{lane}</h1>{records}<footer>{page:02d} / {total:02d} · {run}</footer></main></html>""".format(
        title=html.escape(str(page["title"])), lane=html.escape(str(page["lane"])), records=records,
        page=page["page"], total=total_pages, run=html.escape(str(sanitize(manifest.get("run_id") or "unknown-run"))),
    )


def source_index(manifest: dict[str, Any]) -> list[dict[str, str]]:
    records: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for source_key in ("breaking_reality", "hype_weather", "market_signals"):
        for item in ((manifest.get("brief_inputs") or {}).get(source_key) or []):
            if not isinstance(item, dict):
                continue
            title = str(sanitize(item.get("title") or "record"))
            url = str(sanitize(item.get("url") or ""))
            identity = (title, url)
            if identity in seen:
                continue
            seen.add(identity)
            records.append({"id": f"S{len(records) + 1:03d}", "title": title, "url": url, "source": str(sanitize(item.get("source") or item.get("source_name") or "unknown"))})
    return records


def render_field_dossier(manifest: dict[str, Any], delivery_text: str, wake_receipt: dict[str, Any], output_dir: Path, *, now: datetime | None = None) -> dict[str, Any]:
    verdict = validate_run(manifest, wake_receipt, now=now)
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    if verdict["status"] != "validated":
        receipt_path = output / "withheld-receipt.json"
        receipt_path.write_text(json.dumps(verdict, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        return verdict
    pages = build_pages(manifest)
    total = len(pages)
    rendered: list[dict[str, Any]] = []
    for page in pages:
        stem = f"{page['page']:02d}-{page['section'].replace('_', '-') }"
        html_name = f"{stem}.html"
        png_name = f"{stem}.png"
        html_text = render_html(page, manifest, total)
        (output / html_name).write_text(html_text, encoding="utf-8")
        render_png(page, manifest, output / png_name, total)
        rendered.append({
            "page": page["page"], "section": page["section"], "lane": page["lane"], "title": page["title"],
            "html": html_name, "png": png_name, "png_dimensions": list(PNG_SIZE),
            "html_sha256": sha256(html_text), "png_sha256": sha256((output / png_name).read_bytes()),
            "type_scale": "dossier-24px",
        })
    present = sorted({page["lane"] for page in rendered if page["lane"] in REQUIRED_LANES})
    coverage = {"required": list(REQUIRED_LANES), "present": present, "missing": [lane for lane in REQUIRED_LANES if lane not in present]}
    safe_delivery = sanitize(delivery_text)
    body = {
        "schema_version": "bss.morning_brief.package.v1",
        "run_id": verdict["run_id"],
        "status": "validated",
        "validated_at": verdict["validated_at"],
        "generated_at": sanitize(manifest.get("generated_at")),
        "canonical_generated_at": verdict["canonical_generated_at"],
        "canonical_state_hash": verdict["canonical_state_hash"],
        "delivery_summary": safe_delivery,
        "coverage": coverage,
        "pages": rendered,
        "source_index": source_index(manifest),
        "governance": sanitize(manifest.get("governance") or {}),
    }
    package_hash = sha256(canonical_json(body))
    package = {**body, "package_sha256": package_hash}
    render_manifest = {"template": "Field dossier", "run_id": verdict["run_id"], "package_sha256": package_hash, "coverage": coverage, "pages": rendered}
    (output / "source-index.json").write_text(json.dumps(package["source_index"], indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (output / "render-manifest.json").write_text(json.dumps(render_manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (output / "package.json").write_text(json.dumps(package, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return {**package, "output_dir": str(output), "render_manifest": "render-manifest.json", "source_index_file": "source-index.json"}


def plan_discord_dispatch(package: dict[str, Any], pages: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    if package.get("status") != "validated" or not package.get("package_sha256"):
        return []
    artifacts = list(pages if pages is not None else package.get("pages") or [])
    batches: list[dict[str, Any]] = []
    for offset in range(0, len(artifacts), 10):
        batch_artifacts = artifacts[offset:offset + 10]
        batches.append({
            "batch": len(batches) + 1,
            "package_sha256": package["package_sha256"],
            "artifacts": [{"page": item["page"], "png": item["png"], "png_sha256": item["png_sha256"]} for item in batch_artifacts],
        })
    return batches


def write_dispatch_receipt(package: dict[str, Any], batches: list[dict[str, Any]], output_path: Path, *, status: str = "planned", delivered_batches: list[int] | None = None) -> dict[str, Any]:
    receipt = {
        "schema_version": "bss.morning_brief.discord_receipt.v1",
        "run_id": package.get("run_id"),
        "package_sha256": package.get("package_sha256"),
        "status": status,
        "batch_count": len(batches),
        "delivered_batches": delivered_batches or [],
        "batches": batches,
    }
    Path(output_path).write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return receipt


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--wake-receipt", required=True)
    parser.add_argument("--delivery", required=True, help="Operator summary text file.")
    parser.add_argument("--output-dir", required=True)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or [])
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    receipt = json.loads(Path(args.wake_receipt).read_text(encoding="utf-8"))
    result = render_field_dossier(manifest, Path(args.delivery).read_text(encoding="utf-8"), receipt, Path(args.output_dir))
    if result.get("status") != "validated":
        print(json.dumps(result, indent=2, sort_keys=True))
        return 2
    plan = plan_discord_dispatch(result)
    write_dispatch_receipt(result, plan, Path(args.output_dir) / "discord-receipt.json")
    print(json.dumps({"package": "package.json", "dispatch": plan, "package_sha256": result["package_sha256"]}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    import sys
    raise SystemExit(main(sys.argv[1:]))
