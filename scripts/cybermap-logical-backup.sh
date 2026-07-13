#!/usr/bin/env bash
set -euo pipefail

# Optional Cybermap logical export helper.
# Secrets come from the environment (normally /etc/cybermap-backup.env via systemd).
# This script intentionally avoids xtrace and never prints database URLs/passwords.

usage() {
  cat <<'USAGE'
Usage: cybermap-logical-backup.sh

Required environment:
  CYBERMAP_BACKUP_DATABASE_URL   libpq URL used by pg_dump (keep in a root-owned env file)
  CYBERMAP_BACKUP_STORAGE_ACCOUNT Azure Storage account for the export blob
  CYBERMAP_BACKUP_CONTAINER       Blob container for backups

Optional environment:
  CYBERMAP_BACKUP_PREFIX          Blob prefix (default: cybermap)
  CYBERMAP_BACKUP_AUTH_MODE       az storage auth mode (default: login)
  CYBERMAP_BACKUP_COMPRESS        gzip output after pg_dump custom archive: true/false (default: false)
USAGE
}

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "Missing required environment: $name" >&2
    usage >&2
    exit 2
  fi
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 2
  fi
}

require_env CYBERMAP_BACKUP_DATABASE_URL
require_env CYBERMAP_BACKUP_STORAGE_ACCOUNT
require_env CYBERMAP_BACKUP_CONTAINER
require_cmd pg_dump
require_cmd az

prefix="${CYBERMAP_BACKUP_PREFIX:-cybermap}"
auth_mode="${CYBERMAP_BACKUP_AUTH_MODE:-login}"
compress="${CYBERMAP_BACKUP_COMPRESS:-false}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
umask 077

archive="$tmpdir/cybermap-$stamp.dump"
blob_name="$prefix/postgres/cybermap-$stamp.dump"

if [ "$compress" = "true" ]; then
  blob_name="$blob_name.gz"
fi

echo "Starting Cybermap logical backup: $blob_name"

pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --dbname="$CYBERMAP_BACKUP_DATABASE_URL" \
  --file="$archive"

upload_file="$archive"
if [ "$compress" = "true" ]; then
  gzip -9 "$archive"
  upload_file="$archive.gz"
fi

az storage blob upload \
  --auth-mode "$auth_mode" \
  --account-name "$CYBERMAP_BACKUP_STORAGE_ACCOUNT" \
  --container-name "$CYBERMAP_BACKUP_CONTAINER" \
  --name "$blob_name" \
  --file "$upload_file" \
  --overwrite false \
  --only-show-errors \
  -o none

echo "Completed Cybermap logical backup: $blob_name"
