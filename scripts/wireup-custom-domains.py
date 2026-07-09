#!/usr/bin/env python3
"""Wire blueswallow.co.in and www.blueswallow.co.in to the Static Web App.

This script uses raw ARM HTTPS calls plus GitHub OIDC to avoid depending on
Azure CLI subcommands that are not available in the runner image.
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import time
from functools import lru_cache
from typing import Any
from urllib import error as urllib_error, request as urllib_request
from urllib.parse import quote, urlencode

STATIC_SITES_API_VERSION = "2023-01-01"
CUSTOM_DOMAINS_API_VERSION = "2024-11-01"
DNS_API_VERSION = "2018-05-01"
TOKEN_RETRIES = 12
TOKEN_SLEEP_SECONDS = 5
WWW_DOMAIN_RETRIES = 60
WWW_DOMAIN_SLEEP_SECONDS = 10
TXT_RECORD_NAME = "_dnsauth.www"


def subscription_id() -> str:
    sub_id = os.environ.get("AZURE_SUBSCRIPTION_ID", "").strip()
    if not sub_id:
        raise RuntimeError("AZURE_SUBSCRIPTION_ID environment variable is required.")
    return sub_id


def host_resolves(hostname: str) -> bool:
    try:
        socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return False
    return True


def dns_zone_name_servers(resource_group: str, dns_zone_name: str) -> list[str]:
    zone = arm_request_json(
        "GET",
        f"https://management.azure.com/subscriptions/{subscription_id()}/resourceGroups/{resource_group}/providers/Microsoft.Network/dnsZones/{dns_zone_name}?api-version={DNS_API_VERSION}",
    )
    name_servers = zone.get("properties", {}).get("nameServers") or []
    return [str(name_server).strip() for name_server in name_servers if str(name_server).strip()]



def ensure_public_dns_delegation(
    dns_zone_resource_group: str,
    dns_zone_name: str,
    apex_hostname: str,
    www_hostname: str,
) -> None:
    unresolved = [hostname for hostname in (apex_hostname, www_hostname) if not host_resolves(hostname)]
    if not unresolved:
        return

    try:
        name_servers = dns_zone_name_servers(dns_zone_resource_group, dns_zone_name)
    except RuntimeError as exc:
        raise RuntimeError(
            f"Public DNS for {', '.join(unresolved)} does not resolve from this runner, and the Azure DNS zone lookup failed."
        ) from exc

    nameserver_text = ", ".join(name_servers) if name_servers else "(no name servers returned by Azure DNS)"
    raise RuntimeError(
        f"Public DNS for {', '.join(unresolved)} does not resolve from this runner. "
        f"The Azure DNS zone {dns_zone_name!r} is not publicly delegated (or delegation is still propagating). "
        f"Update the registrar nameservers to: {nameserver_text}"
    )



def management_access_token() -> str:
    client_id = os.environ.get("AZURE_CLIENT_ID", "").strip()
    tenant_id = os.environ.get("AZURE_TENANT_ID", "").strip()
    request_url = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL", "").strip()
    request_token = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "").strip()

    if not client_id or not tenant_id:
        raise RuntimeError("AZURE_CLIENT_ID and AZURE_TENANT_ID environment variables are required.")
    if not request_url or not request_token:
        raise RuntimeError("GitHub OIDC environment variables are required (id-token: write).")

    separator = "&" if "?" in request_url else "?"
    oidc_request = urllib_request.Request(f"{request_url}{separator}audience=api://AzureADTokenExchange")
    oidc_request.add_header("Authorization", f"Bearer {request_token}")
    oidc_request.add_header("Accept", "application/json")

    oidc_payload = request_json(oidc_request, timeout=30)
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

    token_payload = request_json(token_request, timeout=30)
    access_token = str(token_payload.get("access_token") or "").strip()
    if not access_token:
        raise RuntimeError("Azure AD token exchange did not return an access token.")
    return access_token


def request_json(request: urllib_request.Request, *, timeout: int = 60) -> dict[str, Any]:
    try:
        with urllib_request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8").strip()
    except urllib_error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"{request.get_method()} {request.full_url} failed (HTTP {exc.code}): {body.strip()}"
        ) from exc
    except urllib_error.URLError as exc:
        raise RuntimeError(f"{request.get_method()} {request.full_url} failed: {exc.reason}") from exc

    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"raw": raw}


def arm_request_json(method: str, url: str, body: dict[str, Any] | None = None, *, timeout: int = 60) -> dict[str, Any]:
    payload = None if body is None else json.dumps(body, separators=(",", ":")).encode("utf-8")
    request = urllib_request.Request(url, data=payload, method=method.upper())
    request.add_header("Authorization", f"Bearer {management_access_token()}")
    request.add_header("Accept", "application/json")
    if body is not None:
        request.add_header("Content-Type", "application/json")
    return request_json(request, timeout=timeout)


def static_site_url(resource_group: str, static_web_app_name: str) -> str:
    sub_id = subscription_id()
    return (
        f"https://management.azure.com/subscriptions/{sub_id}/resourceGroups/{resource_group}"
        f"/providers/Microsoft.Web/staticSites/{static_web_app_name}?api-version={STATIC_SITES_API_VERSION}"
    )


def custom_domain_url(resource_group: str, static_web_app_name: str, hostname: str) -> str:
    sub_id = subscription_id()
    record_name = quote(hostname, safe=".-")
    return (
        f"https://management.azure.com/subscriptions/{sub_id}/resourceGroups/{resource_group}"
        f"/providers/Microsoft.Web/staticSites/{static_web_app_name}/customDomains/{record_name}"
        f"?api-version={CUSTOM_DOMAINS_API_VERSION}"
    )


def dns_record_set_url(resource_group: str, dns_zone_name: str, record_type: str, record_name: str) -> str:
    sub_id = subscription_id()
    encoded_name = quote(record_name, safe="")
    return (
        f"https://management.azure.com/subscriptions/{sub_id}/resourceGroups/{resource_group}"
        f"/providers/Microsoft.Network/dnsZones/{dns_zone_name}/{record_type}/{encoded_name}"
        f"?api-version={DNS_API_VERSION}"
    )


def get_default_hostname_and_id(resource_group: str, static_web_app_name: str) -> tuple[str, str]:
    resource = arm_request_json("GET", static_site_url(resource_group, static_web_app_name))
    properties = resource.get("properties") or {}
    default_hostname = str(properties.get("defaultHostname") or "").strip()
    resource_id = str(resource.get("id") or "").strip()
    if not default_hostname:
        raise RuntimeError(
            f"Static Web App {static_web_app_name!r} in {resource_group!r} did not return a default hostname."
        )
    if not resource_id:
        raise RuntimeError(
            f"Static Web App {static_web_app_name!r} in {resource_group!r} did not return a resource id."
        )
    return default_hostname, resource_id


def create_custom_domain_and_token(resource_group: str, static_web_app_name: str, hostname: str, validation_method: str) -> str:
    url = custom_domain_url(resource_group, static_web_app_name, hostname)
    arm_request_json("PUT", url, {"properties": {"validationMethod": validation_method}})

    last_error: RuntimeError | None = None
    for attempt in range(1, TOKEN_RETRIES + 1):
        try:
            resource = arm_request_json("GET", url)
            token = str((resource.get("properties") or {}).get("validationToken") or "").strip()
            if token:
                return token
        except RuntimeError as exc:
            last_error = exc
        if attempt < TOKEN_RETRIES:
            time.sleep(TOKEN_SLEEP_SECONDS)

    if last_error is not None:
        raise RuntimeError(
            f"Unable to obtain a validation token for {hostname!r} after {TOKEN_RETRIES} attempts."
        ) from last_error
    raise RuntimeError(f"Unable to obtain a validation token for {hostname!r} after {TOKEN_RETRIES} attempts.")


def create_custom_domain_with_retry(
    resource_group: str,
    static_web_app_name: str,
    hostname: str,
    validation_method: str,
    *,
    retries: int = WWW_DOMAIN_RETRIES,
    sleep_seconds: int = WWW_DOMAIN_SLEEP_SECONDS,
) -> dict[str, Any]:
    url = custom_domain_url(resource_group, static_web_app_name, hostname)
    last_error: RuntimeError | None = None
    for attempt in range(1, retries + 1):
        try:
            return arm_request_json("PUT", url, {"properties": {"validationMethod": validation_method}})
        except RuntimeError as exc:
            last_error = exc
            message = str(exc)
            if validation_method == "cname-delegation" and "CNAME Record is invalid" in message:
                if attempt < retries:
                    print(
                        f"CNAME for {hostname!r} not ready yet (attempt {attempt}/{retries}); retrying in {sleep_seconds}s.",
                        file=sys.stderr,
                    )
                    time.sleep(sleep_seconds)
                    continue
            raise
    if last_error is not None:
        raise last_error
    raise RuntimeError(f"Unable to create custom domain {hostname!r} after {retries} attempts.")

def upsert_txt_record(resource_group: str, dns_zone_name: str, token: str) -> None:
    arm_request_json(
        "PUT",
        dns_record_set_url(resource_group, dns_zone_name, "TXT", TXT_RECORD_NAME),
        {
            "properties": {
                "TTL": 300,
                "TXTRecords": [
                    {
                        "value": [token],
                    }
                ],
            }
        },
    )


def upsert_cname_record(resource_group: str, dns_zone_name: str, hostname: str, target_hostname: str) -> None:
    arm_request_json(
        "PUT",
        dns_record_set_url(resource_group, dns_zone_name, "CNAME", hostname),
        {
            "properties": {
                "TTL": 300,
                "CNAMERecord": {
                    "cname": target_hostname,
                },
            }
        },
    )


def upsert_alias_a_record(resource_group: str, dns_zone_name: str, hostname: str, target_resource_id: str) -> None:
    arm_request_json(
        "PUT",
        dns_record_set_url(resource_group, dns_zone_name, "A", hostname),
        {
            "properties": {
                "TTL": 300,
                "targetResource": {
                    "id": target_resource_id,
                },
            }
        },
    )


def configure_apex(
    resource_group: str,
    static_web_app_name: str,
    dns_zone_resource_group: str,
    dns_zone_name: str,
    apex_hostname: str,
    www_hostname: str,
) -> None:
    default_hostname, static_web_app_id = get_default_hostname_and_id(resource_group, static_web_app_name)
    ensure_public_dns_delegation(dns_zone_resource_group, dns_zone_name, apex_hostname, www_hostname)
    token = create_custom_domain_and_token(resource_group, static_web_app_name, apex_hostname, "dns-txt-token")
    upsert_txt_record(dns_zone_resource_group, dns_zone_name, token)
    upsert_alias_a_record(dns_zone_resource_group, dns_zone_name, "@", static_web_app_id)
    upsert_cname_record(dns_zone_resource_group, dns_zone_name, "www", default_hostname)
    create_custom_domain_with_retry(
        resource_group,
        static_web_app_name,
        www_hostname,
        "cname-delegation",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("static_web_app_name")
    parser.add_argument("resource_group")
    parser.add_argument("dns_zone_resource_group")
    parser.add_argument("dns_zone_name")
    parser.add_argument(
        "default_hostname",
        nargs="?",
        default="",
        help="Optional precomputed Static Web App default hostname (ignored if empty).",
    )
    parser.add_argument("apex_hostname")
    parser.add_argument("www_hostname")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    configure_apex(
        args.resource_group,
        args.static_web_app_name,
        args.dns_zone_resource_group,
        args.dns_zone_name,
        args.apex_hostname,
        args.www_hostname,
    )
    print(
        f"Configured {args.apex_hostname} and {args.www_hostname} for Static Web App {args.static_web_app_name!r} in {args.resource_group!r}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
