#!/usr/bin/env python3
"""Wire blueswallow.co.in and www.blueswallow.co.in to the Static Web App.

This script expects Azure CLI authentication to already be active (for example
via azure/login@v2 in GitHub Actions). It talks directly to the Microsoft.Web
staticSites custom-domains REST resource so it does not depend on any specific
`az staticwebapp hostname ...` subcommands being present in the runner.

It configures:
- www -> CNAME to the Static Web App default hostname
- apex -> TXT validation token + Azure DNS alias A record to the Static Web App

The commands are intentionally idempotent-ish:
- DNS record sets are upserted via ARM PUT calls
- custom-domain resources are upserted via ARM PUT calls
- the apex validation token is reused if the resource already exists
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from dataclasses import dataclass
from urllib.parse import quote

TTL = 300
TOKEN_RETRIES = 12
TOKEN_SLEEP_SECONDS = 5
API_VERSION = "2024-11-01"


@dataclass
class CommandResult:
    returncode: int
    stdout: str
    stderr: str


def run_az(args: list[str], *, check: bool = True) -> CommandResult:
    cmd = ["az", "--only-show-errors", *args]
    proc = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    result = CommandResult(proc.returncode, proc.stdout, proc.stderr)
    if check and proc.returncode != 0:
        raise RuntimeError(
            f"Azure CLI command failed (exit {proc.returncode}).\n"
            f"STDERR: {proc.stderr.strip()}"
        )
    return result


def tsv(args: list[str]) -> str:
    result = run_az([*args, "-o", "tsv"])
    return result.stdout.strip()


def subscription_id() -> str:
    return tsv(["account", "show", "--query", "id"])


def custom_domain_url(
    sub_id: str,
    resource_group: str,
    static_web_app_name: str,
    hostname: str,
) -> str:
    hostname_enc = quote(hostname, safe="")
    return (
        f"https://management.azure.com/subscriptions/{sub_id}"
        f"/resourceGroups/{resource_group}"
        f"/providers/Microsoft.Web/staticSites/{static_web_app_name}"
        f"/customDomains/{hostname_enc}?api-version={API_VERSION}"
    )


def get_custom_domain(
    sub_id: str,
    resource_group: str,
    static_web_app_name: str,
    hostname: str,
) -> dict[str, object] | None:
    result = run_az(
        ["rest", "--method", "get", "--url", custom_domain_url(sub_id, resource_group, static_web_app_name, hostname)],
        check=False,
    )
    if result.returncode != 0:
        stderr = result.stderr.lower()
        if "status code: 404" in stderr or "notfound" in stderr or "resource not found" in stderr:
            return None
        raise RuntimeError(f"Failed to query custom domain {hostname}: {result.stderr.strip()}")
    if not result.stdout.strip():
        return {}
    return json.loads(result.stdout)


def upsert_custom_domain(
    sub_id: str,
    resource_group: str,
    static_web_app_name: str,
    hostname: str,
    validation_method: str,
) -> dict[str, object]:
    url = custom_domain_url(sub_id, resource_group, static_web_app_name, hostname)
    body = {"properties": {"validationMethod": validation_method}}
    result = run_az(
        ["rest", "--method", "put", "--url", url, "--body", json.dumps(body)],
    )
    if not result.stdout.strip():
        return {}
    return json.loads(result.stdout)


def extract_validation_token(payload: dict[str, object] | None) -> str:
    if not payload:
        return ""
    properties = payload.get("properties")
    if not isinstance(properties, dict):
        return ""
    token = properties.get("validationToken")
    if token is None:
        return ""
    return str(token).strip()


def poll_validation_token(
    sub_id: str,
    resource_group: str,
    static_web_app_name: str,
    hostname: str,
    retries: int = TOKEN_RETRIES,
    sleep_seconds: int = TOKEN_SLEEP_SECONDS,
) -> str:
    for attempt in range(1, retries + 1):
        payload = get_custom_domain(sub_id, resource_group, static_web_app_name, hostname)
        token = extract_validation_token(payload)
        if token and token.lower() != "null":
            return token
        if attempt < retries:
            time.sleep(sleep_seconds)
    return ""


def put_record_set(
    sub_id: str,
    dns_zone_resource_group: str,
    dns_zone_name: str,
    record_type: str,
    record_name: str,
    properties: dict[str, object],
) -> None:
    record_name_enc = quote(record_name, safe="")
    url = (
        f"https://management.azure.com/subscriptions/{sub_id}"
        f"/resourceGroups/{dns_zone_resource_group}"
        f"/providers/Microsoft.Network/dnsZones/{dns_zone_name}"
        f"/{record_type}/{record_name_enc}?api-version=2018-05-01"
    )
    body = json.dumps({"properties": properties})
    run_az(["rest", "--method", "put", "--url", url, "--body", body])


def configure_www(
    sub_id: str,
    static_web_app_name: str,
    resource_group: str,
    dns_zone_resource_group: str,
    dns_zone_name: str,
    www_hostname: str,
    default_hostname: str,
) -> None:
    put_record_set(
        sub_id,
        dns_zone_resource_group,
        dns_zone_name,
        "CNAME",
        "www",
        {
            "TTL": TTL,
            "CNAMERecord": {"cname": default_hostname},
        },
    )

    upsert_custom_domain(
        sub_id,
        resource_group,
        static_web_app_name,
        www_hostname,
        validation_method="cname-delegation",
    )

    print(f"CNAME configured: {www_hostname} -> {default_hostname}")


def configure_apex(
    sub_id: str,
    static_web_app_name: str,
    resource_group: str,
    dns_zone_resource_group: str,
    dns_zone_name: str,
    apex_hostname: str,
    static_web_app_resource_id: str,
) -> None:
    preexisting = get_custom_domain(sub_id, resource_group, static_web_app_name, apex_hostname)

    payload = upsert_custom_domain(
        sub_id,
        resource_group,
        static_web_app_name,
        apex_hostname,
        validation_method="dns-txt-token",
    )
    token = extract_validation_token(payload)
    if not token:
        token = poll_validation_token(sub_id, resource_group, static_web_app_name, apex_hostname)

    if token:
        put_record_set(
            sub_id,
            dns_zone_resource_group,
            dns_zone_name,
            "TXT",
            "@",
            {
                "TTL": TTL,
                "TXTRecords": [{"value": [token]}],
            },
        )
        print(f"TXT validation configured for apex domain: {apex_hostname}")
    elif preexisting is None:
        raise RuntimeError(
            f"Validation token for {apex_hostname} was not available after creating the hostname binding."
        )
    else:
        print(
            f"Validation token for {apex_hostname} not returned; assuming an existing TXT record remains in place."
        )

    put_record_set(
        sub_id,
        dns_zone_resource_group,
        dns_zone_name,
        "A",
        "@",
        {
            "TTL": TTL,
            "targetResource": {"id": static_web_app_resource_id},
        },
    )
    print(f"ALIAS configured for apex domain: {apex_hostname}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("static_web_app_name", help="Static Web App name")
    parser.add_argument("resource_group", help="Resource group containing the Static Web App")
    parser.add_argument("dns_zone_resource_group", help="Resource group containing the Azure DNS zone")
    parser.add_argument("dns_zone_name", help="Azure DNS zone name (for example, blueswallow.co.in)")
    parser.add_argument("default_hostname", help="Static Web App default hostname")
    parser.add_argument("static_web_app_resource_id", help="Static Web App resource ID")
    parser.add_argument("apex_hostname", help="Canonical apex hostname")
    parser.add_argument("www_hostname", help="WWW hostname")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    sub_id = subscription_id()

    configure_www(
        sub_id,
        args.static_web_app_name,
        args.resource_group,
        args.dns_zone_resource_group,
        args.dns_zone_name,
        args.www_hostname,
        args.default_hostname,
    )
    configure_apex(
        sub_id,
        args.static_web_app_name,
        args.resource_group,
        args.dns_zone_resource_group,
        args.dns_zone_name,
        args.apex_hostname,
        args.static_web_app_resource_id,
    )

    print("Custom domain wiring requested successfully.")
    print(
        "DNS propagation can take time; Azure DNS usually updates within about an hour, "
        "while apex changes can still take up to 72 hours in the worst case."
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
    except Exception as exc:  # noqa: BLE001 - surface useful CLI failures to CI logs
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
