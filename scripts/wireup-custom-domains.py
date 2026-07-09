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
from functools import lru_cache
from typing import Any
from urllib import error as urllib_error, request as urllib_request
from urllib.parse import quote, urlencode

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


@lru_cache(maxsize=1)
def management_access_token() -> str:
    client_id = os.environ.get("AZURE_CLIENT_ID", "").strip()
    tenant_id = os.environ.get("AZURE_TENANT_ID", "").strip()
    if not client_id or not tenant_id:
        raise RuntimeError("AZURE_CLIENT_ID and AZURE_TENANT_ID environment variables are required.")

    request_url = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL", "").strip()
    request_token = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "").strip()
    if not request_url or not request_token:
        raise RuntimeError("GitHub OIDC environment variables are required (id-token: write).")

    separator = "&" if "?" in request_url else "?"
    oidc_request = urllib_request.Request(f"{request_url}{separator}audience=api://AzureADTokenExchange")
    oidc_request.add_header("Authorization", f"Bearer {request_token}")
    oidc_request.add_header("Accept", "application/json")
    try:
        with urllib_request.urlopen(oidc_request, timeout=30) as response:
            oidc_payload = json.loads(response.read().decode("utf-8"))
    except urllib_error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"GitHub OIDC token request failed (HTTP {exc.code}): {body.strip()}") from exc
    except urllib_error.URLError as exc:
        raise RuntimeError(f"GitHub OIDC token request failed: {exc.reason}") from exc
    oidc_jwt = str(oidc_payload.get("value") or "").strip()
    if not oidc_jwt:
        raise RuntimeError("GitHub OIDC token request did not return a token payload.")

    token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    token_body = urlencode(
        {
            "client_id": client_id,
            "scope": "https://management.azure.com/.default",
            "grant_type": "client_credentials",
            "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
            "client_assertion": oidc_jwt,
        }
    ).encode("utf-8")
    token_request = urllib_request.Request(token_url, data=token_body, method="POST")
    token_request.add_header("Content-Type", "application/x-www-form-urlencoded")
    token_request.add_header("Accept", "application/json")
    try:
        with urllib_request.urlopen(token_request, timeout=30) as response:
            token_payload = json.loads(response.read().decode("utf-8"))
    except urllib_error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Azure AD token exchange failed (HTTP {exc.code}): {body.strip()}") from exc
    except urllib_error.URLError as exc:
        raise RuntimeError(f"Azure AD token exchange failed: {exc.reason}") from exc
    access_token = str(token_payload.get("access_token") or "").strip()
    if not access_token:
        raise RuntimeError("Azure AD token exchange did not return an access token.")
    return access_token


def arm_put(url: str, body: dict[str, Any]) -> None:
    payload = json.dumps(body, separators=(",", ":")).encode("utf-8")
    request = urllib_request.Request(url, data=payload, method="PUT")
    request.add_header("Authorization", f"Bearer {management_access_token()}")
    request.add_header("Content-Type", "application/json")
    try:
        with urllib_request.urlopen(request, timeout=60) as response:
            response.read()
    except urllib_error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"ARM request failed for {url} (HTTP {exc.code}).\nSTDERR: {error_body.strip()}"
        ) from exc
    except urllib_error.URLError as exc:
        raise RuntimeError(f"ARM request failed for {url}: {exc.reason}") from exc


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
