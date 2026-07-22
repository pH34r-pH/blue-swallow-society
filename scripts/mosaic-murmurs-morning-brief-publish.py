#!/usr/bin/env python3
"""Archive and dispatch a validated Mosaic & Murmurs Field Dossier.

The publisher is deliberately transport-last:

1. require a successful wake receipt and a canonical snapshot younger than three hours;
2. render the deterministic Field Dossier;
3. archive one content-addressed package through the private backend;
4. read every archived artifact back and verify its hash; and only then
5. send Discord PNG batches (at most ten attachments each) with durable local receipts.

It never falls back to a stale run, a public URL, or a best-effort text-only packet.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import importlib.util
import json
import math
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.parse import quote

SCRIPT_DIR = Path(__file__).resolve().parent
RENDERER_PATH = SCRIPT_DIR / "mosaic-murmurs-morning-brief-render.py"
DEFAULT_RUNTIME_DIR = Path.home() / ".hermes" / "mosaic-murmurs" / "morning-brief"
DEFAULT_WAKE_RECEIPT = Path.home() / ".hermes" / "mosaic-murmurs" / "paper-memory-loop" / "wake-brief-receipt.json"
DEFAULT_RECEIPT_DIR = DEFAULT_RUNTIME_DIR / "publication-receipts"
MAX_SUMMARY_CHARS = 7_800
RUN_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{2,120}$")


def load_renderer():
    spec = importlib.util.spec_from_file_location("mosaic_murmurs_field_dossier", RENDERER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Field Dossier renderer is unavailable.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def canonical_state_digest(value: Any) -> str:
    """Hash canonical state semantically across Python/Node's integral-number encoding boundary."""
    def normalize(item: Any) -> Any:
        if isinstance(item, float):
            if not math.isfinite(item):
                raise RuntimeError("Canonical paper state contains a non-finite numeric value.")
            return int(item) if item.is_integer() else item
        if isinstance(item, list):
            return [normalize(child) for child in item]
        if isinstance(item, dict):
            return {str(key): normalize(child) for key, child in item.items()}
        return item
    return sha256(canonical_json(normalize(value)))


def _safe_path(root: Path, name: str) -> Path:
    candidate = (root / name).resolve()
    if candidate.parent != root.resolve():
        raise RuntimeError("Field Dossier artifact escaped the staged package.")
    return candidate


def _artifact(artifact_id: str, media_type: str, content: bytes) -> dict[str, str]:
    if not content:
        raise RuntimeError(f"Archive artifact {artifact_id} is empty.")
    return {
        "artifact_id": artifact_id,
        "media_type": media_type,
        "sha256": sha256(content),
        "content_base64": base64.b64encode(content).decode("ascii"),
    }


def _safe_summary(value: Any, renderer: Any) -> str:
    summary = str(renderer.sanitize(value or "Validated Field Dossier retained without a narrative summary."))
    summary = " ".join(summary.split())
    return summary[:MAX_SUMMARY_CHARS]


def build_archive_envelope(rendered: dict[str, Any], output_dir: Path, delivery_path: Path | None = None) -> dict[str, Any]:
    """Translate the local renderer package into the private archive contract.

    The envelope hash binds only immutable metadata and each artifact's byte hash;
    base64 is transport encoding rather than package identity.
    """
    if rendered.get("status") != "validated":
        raise RuntimeError("A withheld Field Dossier cannot be archived.")
    renderer = load_renderer()
    output = Path(output_dir).resolve()
    artifacts: list[dict[str, str]] = []
    for page in rendered.get("pages") or []:
        page_number = page.get("page")
        if not isinstance(page_number, int) or page_number < 1:
            raise RuntimeError("Field Dossier page metadata is invalid.")
        png_name = str(page.get("png") or "")
        png_path = _safe_path(output, png_name)
        content = png_path.read_bytes()
        if sha256(content) != page.get("png_sha256"):
            raise RuntimeError(f"Field Dossier page {page_number} failed local hash validation.")
        artifacts.append(_artifact(f"page-{page_number:02d}", "image/png", content))

    for artifact_id, filename, media_type in (
        ("field-dossier-package", "package.json", "application/json; charset=utf-8"),
        ("render-manifest", "render-manifest.json", "application/json; charset=utf-8"),
        ("source-index", "source-index.json", "application/json; charset=utf-8"),
    ):
        artifacts.append(_artifact(artifact_id, media_type, _safe_path(output, filename).read_bytes()))

    summary = _safe_summary(rendered.get("delivery_summary"), renderer)
    artifacts.append(_artifact("delivery-summary", "text/plain; charset=utf-8", (summary + "\n").encode("utf-8")))
    if delivery_path is not None:
        delivery_text = _safe_summary(Path(delivery_path).read_text(encoding="utf-8"), renderer)
        artifacts.append(_artifact("brief-markdown", "text/markdown; charset=utf-8", (delivery_text + "\n").encode("utf-8")))

    bound = {
        "schema_version": "bss.morning_brief.package.v1",
        "run_id": rendered["run_id"],
        "generated_at": rendered["generated_at"],
        "canonical_state_hash": rendered["canonical_state_hash"],
        "summary": summary,
        "artifacts": [
            {key: artifact[key] for key in ("artifact_id", "media_type", "sha256")}
            for artifact in artifacts
        ],
    }
    return {**bound, "package_sha256": sha256(canonical_json(bound)), "artifacts": artifacts}


def verify_archived_package(envelope: dict[str, Any], brief: dict[str, Any], artifact_payloads: dict[str, bytes]) -> None:
    """Fail closed unless archive metadata and every stored byte match local package identity."""
    for field in ("run_id", "package_sha256", "canonical_state_hash"):
        if brief.get(field) != envelope.get(field):
            label = "package hash" if field == "package_sha256" else field.replace("_", " ")
            raise RuntimeError(f"Archived Field Dossier {label} does not match the staged package.")
    remote = {item.get("artifact_id"): item for item in brief.get("artifacts") or [] if isinstance(item, dict)}
    for artifact in envelope["artifacts"]:
        artifact_id = artifact["artifact_id"]
        metadata = remote.get(artifact_id)
        if not metadata or metadata.get("sha256") != artifact["sha256"] or metadata.get("media_type") != artifact["media_type"]:
            raise RuntimeError(f"Archived Field Dossier artifact metadata mismatch: {artifact_id}.")
        content = artifact_payloads.get(artifact_id)
        if content is None or sha256(content) != artifact["sha256"]:
            raise RuntimeError(f"Archived Field Dossier artifact hash mismatch: {artifact_id}.")


def _base_url(base: str, path: str) -> str:
    return f"{base.rstrip('/')}/{path.lstrip('/')}"


def _request(method: str, url: str, *, token_name: str, token: str, payload: dict[str, Any] | None = None, headers: dict[str, str] | None = None) -> tuple[int, dict[str, str], bytes]:
    encoded = canonical_json(payload) if payload is not None else None
    request = urllib.request.Request(url, data=encoded, method=method)
    request.add_header(token_name, token)
    request.add_header("Accept", "application/json")
    if payload is not None:
        request.add_header("Content-Type", "application/json")
    for key, value in (headers or {}).items():
        request.add_header(key, value)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, {key.lower(): value for key, value in response.headers.items()}, response.read()
    except urllib.error.HTTPError as error:
        return error.code, {key.lower(): value for key, value in error.headers.items()}, error.read()
    except urllib.error.URLError as error:
        raise RuntimeError("Morning-brief backend is unreachable.") from error


def _json_response(status: int, body: bytes, action: str) -> dict[str, Any]:
    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Morning-brief backend returned invalid JSON during {action}.") from error
    if status < 200 or status >= 300 or not isinstance(payload, dict) or payload.get("ok") is not True:
        raise RuntimeError(f"Morning-brief backend rejected {action} (HTTP {status}).")
    return payload


def fetch_canonical_paper_state(base_url: str, paper_token: str) -> dict[str, Any]:
    status, _, body = _request("GET", _base_url(base_url, "api/v1/paper/state"), token_name="X-Blue-Swallow-Paper-State-Token", token=paper_token)
    payload = _json_response(status, body, "canonical-paper-state fetch")
    state = payload.get("state")
    if not isinstance(state, dict):
        raise RuntimeError("Morning-brief backend did not return a canonical paper state.")
    return state


def archive_and_readback(base_url: str, archive_token: str, envelope: dict[str, Any]) -> dict[str, Any]:
    idempotency_key = f"{envelope['run_id']}:{envelope['package_sha256']}"
    status, _, body = _request(
        "POST",
        _base_url(base_url, "api/v1/morning-briefs"),
        token_name="X-Blue-Swallow-Morning-Brief-Token",
        token=archive_token,
        payload=envelope,
        headers={"Idempotency-Key": idempotency_key},
    )
    created = _json_response(status, body, "archive write")
    if created.get("brief", {}).get("package_sha256") != envelope["package_sha256"]:
        raise RuntimeError("Morning-brief archive write returned a mismatched package hash.")

    run_path = quote(envelope["run_id"], safe="")
    status, _, body = _request("GET", _base_url(base_url, f"api/v1/morning-briefs/{run_path}"), token_name="X-Blue-Swallow-Morning-Brief-Token", token=archive_token)
    response = _json_response(status, body, "archive readback")
    brief = response.get("brief")
    if not isinstance(brief, dict):
        raise RuntimeError("Morning-brief archive readback did not include package metadata.")

    payloads: dict[str, bytes] = {}
    for artifact in envelope["artifacts"]:
        artifact_path = quote(artifact["artifact_id"], safe="")
        status, headers, content = _request(
            "GET",
            _base_url(base_url, f"api/v1/morning-briefs/{run_path}/artifacts/{artifact_path}"),
            token_name="X-Blue-Swallow-Morning-Brief-Token",
            token=archive_token,
        )
        if status != 200 or sha256(content) != artifact["sha256"]:
            raise RuntimeError(f"Morning-brief archive readback failed for {artifact['artifact_id']}.")
        payloads[artifact["artifact_id"]] = content
    verify_archived_package(envelope, brief, payloads)
    return brief


def _receipt_dir(receipt_root: Path, package: dict[str, Any]) -> Path:
    return receipt_root / package["run_id"] / package["package_sha256"]


def _delivered_batches(receipt_dir: Path) -> set[int]:
    delivered: set[int] = set()
    if not receipt_dir.exists():
        return delivered
    for receipt in receipt_dir.glob("*.json"):
        try:
            data = json.loads(receipt.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if data.get("status") == "delivered" and isinstance(data.get("batch"), int):
            delivered.add(data["batch"])
    return delivered


def _write_receipt(receipt_dir: Path, record: dict[str, Any], now: datetime) -> Path:
    receipt_dir.mkdir(parents=True, exist_ok=True)
    stamp = now.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    filename = f"batch-{record['batch']:02d}-{record['status']}-{stamp}-{uuid.uuid4().hex[:12]}.json"
    output = receipt_dir / filename
    with output.open("x", encoding="utf-8") as handle:
        json.dump(record, handle, indent=2, sort_keys=True)
        handle.write("\n")
    return output


def plan_dispatch(package: dict[str, Any]) -> list[dict[str, Any]]:
    if package.get("status") != "validated" or not package.get("package_sha256"):
        return []
    pages = package.get("pages") or []
    if not pages:
        raise RuntimeError("Validated Field Dossier has no PNG pages to dispatch.")
    batches = []
    for offset in range(0, len(pages), 10):
        batches.append({"batch": len(batches) + 1, "pages": pages[offset:offset + 10]})
    return batches


def hermes_sender(target: str, message: str) -> dict[str, Any]:
    binary = os.environ.get("HERMES_BIN", "hermes")
    result = subprocess.run([binary, "send", "--to", target, "--json", message], text=True, capture_output=True, check=False, timeout=90)
    if result.returncode != 0:
        raise RuntimeError("Hermes Discord delivery rejected the packet batch.")
    try:
        parsed = json.loads(result.stdout)
    except json.JSONDecodeError:
        parsed = {"result": result.stdout.strip()}
    return parsed if isinstance(parsed, dict) else {"result": parsed}


def dispatchable_package(rendered: dict[str, Any], envelope: dict[str, Any]) -> dict[str, Any]:
    """Bind Discord receipts to the same immutable envelope persisted by the archive."""
    if rendered.get("status") != "validated" or not rendered.get("pages"):
        raise RuntimeError("A withheld or page-less Field Dossier cannot be dispatched.")
    for field in ("run_id", "canonical_state_hash"):
        if rendered.get(field) != envelope.get(field):
            raise RuntimeError(f"Dispatch package {field.replace('_', ' ')} does not match the archived envelope.")
    package_sha256 = envelope.get("package_sha256")
    if not isinstance(package_sha256, str) or not re.fullmatch(r"[a-f0-9]{64}", package_sha256):
        raise RuntimeError("Archived Field Dossier package hash is invalid.")
    return {
        "status": "validated",
        "run_id": envelope["run_id"],
        "package_sha256": package_sha256,
        "pages": list(rendered["pages"]),
    }


def dispatch_packet(package: dict[str, Any], output_dir: Path, receipt_root: Path, target: str, *, sender: Callable[[str, str], dict[str, Any]] = hermes_sender, now: datetime | None = None) -> dict[str, Any]:
    current = now or datetime.now(timezone.utc)
    batches = plan_dispatch(package)
    receipt_dir = _receipt_dir(Path(receipt_root), package)
    delivered = _delivered_batches(receipt_dir)
    output = Path(output_dir).resolve()
    for item in batches:
        batch_number = item["batch"]
        if batch_number in delivered:
            continue
        media = []
        page_hashes = []
        for page in item["pages"]:
            png = _safe_path(output, str(page.get("png") or ""))
            content = png.read_bytes()
            if sha256(content) != page.get("png_sha256"):
                raise RuntimeError(f"Discord dispatch source page hash mismatch: {png.name}.")
            media.append(f"MEDIA:{png}")
            page_hashes.append({"page": page["page"], "sha256": page["png_sha256"]})
        message = "\n".join([
            f"MOSAIC & MURMURS · FIELD DOSSIER · {package['run_id']}",
            f"PACKAGE {package['package_sha256'][:16]} · BATCH {batch_number}/{len(batches)}",
            *media,
        ])
        try:
            transport = sender(target, message)
        except Exception as error:
            _write_receipt(receipt_dir, {
                "schema_version": "bss.morning_brief.discord_receipt.v1",
                "run_id": package["run_id"],
                "package_sha256": package["package_sha256"],
                "batch": batch_number,
                "batch_count": len(batches),
                "status": "failed",
                "artifact_hashes": page_hashes,
                "error": type(error).__name__,
                "recorded_at": current.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            }, current)
            raise
        _write_receipt(receipt_dir, {
            "schema_version": "bss.morning_brief.discord_receipt.v1",
            "run_id": package["run_id"],
            "package_sha256": package["package_sha256"],
            "batch": batch_number,
            "batch_count": len(batches),
            "status": "delivered",
            "artifact_hashes": page_hashes,
            "transport": transport,
            "recorded_at": current.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        }, current)
        delivered.add(batch_number)
    return {"status": "delivered", "delivered_batches": sorted(delivered), "batch_count": len(batches)}


def load_json(path: Path) -> dict[str, Any]:
    try:
        parsed = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError("Required morning-brief input is unavailable or malformed.") from error
    if not isinstance(parsed, dict):
        raise RuntimeError("Required morning-brief input must be a JSON object.")
    return parsed


def publish(args: argparse.Namespace) -> dict[str, Any]:
    renderer = load_renderer()
    manifest = load_json(args.manifest)
    wake_receipt = load_json(args.wake_receipt)
    run_id = manifest.get("run_id")
    if not isinstance(run_id, str) or not RUN_ID_RE.fullmatch(run_id):
        return {"status": "withheld", "reasons": ["invalid_run_id"]}
    delivery = Path(args.delivery)
    if not delivery.is_file():
        return {"status": "withheld", "reasons": ["delivery_missing"]}
    verdict = renderer.validate_run(manifest, wake_receipt)
    if verdict.get("status") != "validated":
        return {"status": "withheld", "reasons": verdict.get("reasons", [])}
    canonical = wake_receipt.get("canonical_paper_state")
    if not isinstance(canonical, dict):
        return {"status": "withheld", "reasons": ["canonical_state_missing"]}
    remote = fetch_canonical_paper_state(args.backend_url, args.paper_token)
    if canonical_state_digest(remote) != canonical_state_digest(canonical):
        return {"status": "withheld", "reasons": ["remote_canonical_state_mismatch"]}

    output = Path(args.runtime_dir) / "rendered" / f"{run_id}-field-dossier"
    rendered = renderer.render_field_dossier(manifest, delivery.read_text(encoding="utf-8"), wake_receipt, output)
    if rendered.get("status") != "validated":
        return {"status": "withheld", "reasons": rendered.get("reasons", [])}
    envelope = build_archive_envelope(rendered, output, delivery)
    archive_and_readback(args.backend_url, args.archive_token, envelope)
    result = {"status": "archived", "run_id": envelope["run_id"], "package_sha256": envelope["package_sha256"], "artifact_count": len(envelope["artifacts"])}
    if not args.no_dispatch:
        result["dispatch"] = dispatch_packet(dispatchable_package(rendered, envelope), output, args.receipt_dir, args.discord_target)
    return result


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    today = datetime.now(timezone.utc).date().isoformat()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime-dir", type=Path, default=DEFAULT_RUNTIME_DIR)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--delivery", type=Path)
    parser.add_argument("--wake-receipt", type=Path, default=DEFAULT_WAKE_RECEIPT)
    parser.add_argument("--receipt-dir", type=Path, default=DEFAULT_RECEIPT_DIR)
    parser.add_argument("--backend-url", default=os.environ.get("BSS_MORNING_BRIEF_BASE_URL", ""))
    parser.add_argument("--archive-token", default=os.environ.get("BSS_MORNING_BRIEF_TOKEN", ""))
    parser.add_argument("--paper-token", default=os.environ.get("BSS_PAPER_STATE_TOKEN", ""))
    parser.add_argument("--discord-target", default=os.environ.get("BSS_MORNING_BRIEF_DISCORD_TARGET", "discord:1506403622789976145"))
    parser.add_argument("--no-dispatch", action="store_true")
    args = parser.parse_args(argv)
    args.manifest = args.manifest or args.runtime_dir / "runs" / f"morning-brief-{today}.json"
    args.delivery = args.delivery or args.runtime_dir / "runs" / f"morning-brief-{today}.md"
    if not str(args.backend_url).startswith("https://"):
        parser.error("--backend-url must be an HTTPS endpoint.")
    if not all(str(token).strip() for token in (args.archive_token, args.paper_token)):
        parser.error("archive and paper-state tokens must be supplied through protected environment variables or arguments.")
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        result = publish(args)
    except RuntimeError as error:
        print(json.dumps({"status": "failed", "error": str(error)}, sort_keys=True))
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0 if result.get("status") in {"archived", "withheld"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
