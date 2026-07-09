#!/usr/bin/env python3
"""Wire blueswallow.co.in and www.blueswallow.co.in to the Static Web App.

This script expects Azure CLI authentication to already be active (for example
via azure/login@v2 in GitHub Actions). It configures:

- www -> CNAME to the Static Web App default hostname
- apex -> TXT validation plus an Azure DNS alias A record to the Static Web
  App resource
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from typing import Any
from urllib.parse import quote

TTL = 300
TOKEN_RETRIES = 12
TOKEN_SLEEP_SECONDS = 5


def run_az(args: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    cmd = ["az", "--only-show-errors", *args]
    proc = subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if check and proc.returncode != 0:
        raise RuntimeError(
            f"Azure CLI command failed (exit {proc.returncode}).\nSTDERR: {proc.stderr.strip()}"
        )
    return proc


def subscription_id() -> str:
    sub_id = os.environ.get("AZURE_SUBSCRIPTION_ID", "").strip()
    if not sub_id:
        raise RuntimeError("AZURE_SUBSCRIPTION_ID environment variable is required.")
    return sub_id


def hostname_list(static_web_app_name: str, resource_group: str) -> list[dict[str, Any]]:
    proc = run_az(
        [
            "staticwebapp",
            "hostname",
            "list",
            "-n",
            static_web_app_name,
            "-g",
            resource_group,
            "-o",
            "json",
        ]
    )
    payload = proc.stdout.strip()
    if not payload:
        return []
    data = json.loads(payload)
    return data if isinstance(data, list) else []


def find_hostname_entry(static_web_app_name: str, resource_group: str, hostname: str) -> dict[str, Any] | None:
    for entry in hostname_list(static_web_app_name, resource_group):
        entry_hostname = str(
            entry.get("domainName")
            or entry.get("hostname")
            or entry.get("hostName")
            or entry.get("name")
            or ""
        ).strip()
        if entry_hostname.lower() == hostname.lower():
            return entry
    return None


def ensure_hostname_binding(
    static_web_app_name: str,
    resource_group: str,
    hostname: str,
    validation_method: str,
) -> None:
    if find_hostname_entry(static_web_app_name, resource_group, hostname) is not None:
        return

    run_az(
        [
            "staticwebapp",
            "hostname",
            "set",
            "-n",
            static_web_app_name,
            "-g",
            resource_group,
            "--hostname",
            hostname,
            "--validation-method",
            validation_method,
            "--no-wait",
        ]
    )


def fetch_validation_token(
    static_web_app_name: str,
    resource_group: str,
    hostname: str,
    *,
    required: bool,
    retries: int = TOKEN_RETRIES,
    sleep_seconds: int = TOKEN_SLEEP_SECONDS,
) -> str:
    for attempt in range(1, retries + 1):
        proc = run_az(
            [
                "staticwebapp",
                "hostname",
                "show",
                "-n",
                static_web_app_name,
                "-g",
                resource_group,
                "--hostname",
                hostname,
                "--query",
                "validationToken",
                "-o",
                "tsv",
            ],
            check=False,
        )
        token = proc.stdout.strip()
        if proc.returncode == 0 and token and token.lower() != "null":
            return token
        if attempt < retries:
            time.sleep(sleep_seconds)

    if required:
        raise RuntimeError(f"Validation token for {hostname} was not returned after requesting TXT validation.")
    return ""


# Azure DNS record-set CLI commands live behind the dns extension on some
# runners, so we use ARM REST directly to keep the deployment self-contained.
def dns_record_set_url(resource_group: str, zone_name: str, record_type: str, record_name: str) -> str:
    encoded_name = quote(record_name, safe="")
    sub_id = subscription_id()
    return (
        f"https://management.azure.com/subscriptions/{sub_id}/resourceGroups/{resource_group}"
        f"/providers/Microsoft.Network/dnsZones/{zone_name}/{record_type}/{encoded_name}?api-version=2018-05-01"
    )


def arm_put(url: str, body: dict[str, Any]) -> None:
    run_az(
        [
            "rest",
            "--method",
            "put",
            "--url",
            url,
            "--body",
            json.dumps(body, separators=(",", ":")),
        ]
    )


def upsert_cname_record(resource_group: str, zone_name: str, hostname: str, cname: str) -> None:
    arm_put(
        dns_record_set_url(resource_group, zone_name, "CNAME", hostname),
        {
            "properties": {
                "TTL": TTL,
                "CNAMERecord": {
                    "cname": cname,
                },
            }
        },
    )


def upsert_txt_record(resource_group: str, zone_name: str, hostname: str, token: str) -> None:
    arm_put(
        dns_record_set_url(resource_group, zone_name, "TXT", hostname),
        {
            "properties": {
                "TTL": TTL,
                "TXTRecords": [
                    {
                        "value": [token],
                    }
                ],
            }
        },
    )


def upsert_alias_a_record(resource_group: str, zone_name: str, hostname: str, target_resource_id: str) -> None:
    arm_put(
        dns_record_set_url(resource_group, zone_name, "A", hostname),
        {
            "properties": {
                "TTL": TTL,
                "targetResource": {
                    "id": target_resource_id,
                },
            }
        },
    )


def configure_www(
    static_web_app_name: str,
    resource_group: str,
    dns_zone_resource_group: str,
    dns_zone_name: str,
    www_hostname: str,
    default_hostname: str,
) -> None:
    upsert_cname_record(dns_zone_resource_group, dns_zone_name, "www", default_hostname)
    ensure_hostname_binding(static_web_app_name, resource_group, www_hostname, "cname-delegation")
    print(f"CNAME configured: {www_hostname} -> {default_hostname}")


def configure_apex(
    sub_id: str,
    static_web_app_name: str,
    resource_group: str,
    dns_zone_resource_group: str,
    dns_zone_name: str,
    apex_hostname: str,
) -> None:
    preexisting = find_hostname_entry(static_web_app_name, resource_group, apex_hostname)

    ensure_hostname_binding(static_web_app_name, resource_group, apex_hostname, "dns-txt-token")
    token = fetch_validation_token(
        static_web_app_name,
        resource_group,
        apex_hostname,
        required=preexisting is None,
    )

    if token:
        upsert_txt_record(dns_zone_resource_group, dns_zone_name, "@", token)
        print(f"TXT validation configured for apex domain: {apex_hostname}")
    elif preexisting is None:
        raise RuntimeError(f"Validation token for {apex_hostname} was not available after requesting TXT validation.")
    else:
        print(f"Validation token for {apex_hostname} not returned; assuming an existing TXT record remains in place.")

    upsert_alias_a_record(
        dns_zone_resource_group,
        dns_zone_name,
        "@",
        f"/subscriptions/{sub_id}/resourceGroups/{resource_group}/providers/Microsoft.Web/staticSites/{static_web_app_name}",
    )
    print(f"ALIAS configured for apex domain: {apex_hostname}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("static_web_app_name", help="Static Web App name")
    parser.add_argument("resource_group", help="Resource group containing the Static Web App")
    parser.add_argument("dns_zone_resource_group", help="Resource group containing the Azure DNS zone")
    parser.add_argument("dns_zone_name", help="Azure DNS zone name (for example, blueswallow.co.in)")
    parser.add_argument("default_hostname", help="Static Web App default hostname")
    parser.add_argument("apex_hostname", help="Canonical apex hostname")
    parser.add_argument("www_hostname", help="WWW hostname")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    sub_id = subscription_id()

    configure_www(
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
    )

    print("Custom domains wired successfully. DNS propagation can still take some time.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
