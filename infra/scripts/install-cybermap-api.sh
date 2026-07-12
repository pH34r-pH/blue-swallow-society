#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

POSTGRES_PASSWORD="$(printf '%s' '__POSTGRES_PASSWORD_B64__' | base64 -d)"
CYBERMAP_READ_TOKEN="$(printf '%s' '__CYBERMAP_READ_TOKEN_B64__' | base64 -d)"
if [ -z "$POSTGRES_PASSWORD" ]; then
  echo "PostgreSQL password is empty" >&2
  exit 1
fi
if [ -z "$CYBERMAP_READ_TOKEN" ]; then
  echo "Cybermap read token is empty" >&2
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl gnupg postgresql-client tar

if ! command -v node >/dev/null 2>&1 || ! node --version | grep -Eq '^v22\.'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

rm -rf /tmp/bss-source /tmp/bss.tar.gz
mkdir -p /tmp/bss-source /opt/bss
curl -fsSL '__CYBERMAP_SOURCE_TARBALL_URL__' -o /tmp/bss.tar.gz
tar -xzf /tmp/bss.tar.gz -C /tmp/bss-source --strip-components=1
rm -rf /opt/bss/cybermap-api
cp -a /tmp/bss-source/vm/cybermap-api /opt/bss/cybermap-api
cd /opt/bss/cybermap-api
npm ci --omit=dev

install -d -m 0750 -o root -g root /etc/bss
cat > /etc/bss/cybermap-api.env <<ENV
PGHOST=__POSTGRES_SERVER_FQDN__
PGPORT=5432
PGDATABASE=__POSTGRES_DATABASE_NAME__
PGUSER=__POSTGRES_ADMINISTRATOR_LOGIN__
PGPASSWORD=$POSTGRES_PASSWORD
PGSSLMODE=require
BSS_CYBERMAP_BIND_HOST=0.0.0.0
BSS_CYBERMAP_PORT=__CYBERMAP_API_PORT__
BSS_CYBERMAP_DB_POOL_MAX=4
BSS_CYBERMAP_READ_TOKEN=$CYBERMAP_READ_TOKEN
ENV
chmod 0600 /etc/bss/cybermap-api.env

set -a
. /etc/bss/cybermap-api.env
set +a

migration_applied() {
  local version="$1"
  local has_table
  has_table="$(psql -v ON_ERROR_STOP=1 -Atqc "SELECT to_regclass('public.schema_migrations') IS NOT NULL")"
  if [ "$has_table" != "t" ]; then
    return 1
  fi
  [ "$(psql -v ON_ERROR_STOP=1 -Atqc "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '$version')")" = "t" ]
}

run_migration() {
  local version="$1"
  local file="$2"
  if migration_applied "$version"; then
    echo "Migration $version already applied; skipping."
    return 0
  fi
  psql -v ON_ERROR_STOP=1 -f "$file"
}

run_migration 0001_cybermap_core db/migrations/0001_cybermap_core.sql
run_migration 0002_device_ingest_contract db/migrations/0002_device_ingest_contract.sql

cat > /etc/systemd/system/bss-cybermap-api.service <<'UNIT'
[Unit]
Description=Blue Swallow Cybermap API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/bss/cybermap-api
EnvironmentFile=/etc/bss/cybermap-api.env
ExecStart=/usr/bin/node /opt/bss/cybermap-api/src/main.mjs
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl disable --now echo-server.service || true
systemctl enable bss-cybermap-api.service
systemctl restart bss-cybermap-api.service
systemctl is-active --quiet bss-cybermap-api.service
