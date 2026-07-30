#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

POSTGRES_PASSWORD="$(printf '%s' '__POSTGRES_PASSWORD_B64__' | base64 -d)"
CYBERMAP_READ_TOKEN="$(printf '%s' '__CYBERMAP_READ_TOKEN_B64__' | base64 -d)"
PAPER_STATE_TOKEN="$(printf '%s' '__PAPER_STATE_TOKEN_B64__' | base64 -d)"
MORNING_BRIEF_TOKEN="$(printf '%s' '__MORNING_BRIEF_TOKEN_B64__' | base64 -d)"
BSS_MTLS_PROXY_SECRET="$(printf '%s' '__BSS_MTLS_PROXY_SECRET_B64__' | base64 -d)"
RAID_MODEL_TRUSTED_PUBLIC_KEYS_JSON="$(printf '%s' '__BSS_RAID_MODEL_TRUSTED_PUBLIC_KEYS_JSON_B64__' | base64 -d)"
if [ -z "$POSTGRES_PASSWORD" ]; then
  echo "PostgreSQL password is empty" >&2
  exit 1
fi
if [ -z "$CYBERMAP_READ_TOKEN" ]; then
  echo "Cybermap read token is empty" >&2
  exit 1
fi
if [ -z "$PAPER_STATE_TOKEN" ]; then
  echo "Paper state token is empty" >&2
  exit 1
fi
if [ -z "$MORNING_BRIEF_TOKEN" ]; then
  echo "Morning brief token is empty" >&2
  exit 1
fi
if [ -z "$BSS_MTLS_PROXY_SECRET" ]; then
  echo "mTLS proxy secret is empty" >&2
  exit 1
fi
if [ -z "$RAID_MODEL_TRUSTED_PUBLIC_KEYS_JSON" ]; then
  echo "RaID trusted public key configuration is empty" >&2
  exit 1
fi
if printf '%s' "$RAID_MODEL_TRUSTED_PUBLIC_KEYS_JSON" | grep -Eiq 'BEGIN[[:space:]].*PRIVATE[[:space:]]+KEY'; then
  echo "RaID trusted key configuration must not contain a private key" >&2
  exit 1
fi


apt-get update
apt-get install -y ca-certificates curl gnupg debian-keyring debian-archive-keyring apt-transport-https postgresql-client tar librsvg2-bin

if ! command -v node >/dev/null 2>&1 || ! node --version | grep -Eq '^v24\.'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
if ! RAID_MODEL_TRUSTED_PUBLIC_KEYS_JSON="$(printf '%s' "$RAID_MODEL_TRUSTED_PUBLIC_KEYS_JSON" | node -e 'const { createPublicKey } = require("node:crypto"); let raw = ""; process.stdin.on("data", (chunk) => { raw += chunk; }); process.stdin.on("end", () => { const parsed = JSON.parse(raw); if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object" || Object.keys(parsed).length === 0) process.exit(2); for (const [keyId, pem] of Object.entries(parsed)) { if (!/^[a-z][a-z0-9-]{2,63}$/.test(keyId) || typeof pem !== "string" || pem.length === 0 || pem.length > 8192) process.exit(2); const publicKey = createPublicKey(pem); if (publicKey.asymmetricKeyType !== "ec" || publicKey.asymmetricKeyDetails?.namedCurve !== "prime256v1") process.exit(2); } process.stdout.write(JSON.stringify(parsed)); });')"; then
  echo "RaID trusted public key configuration is invalid" >&2
  exit 1
fi
RAID_MODEL_TRUSTED_PUBLIC_KEYS_JSON_B64="$(printf '%s' "$RAID_MODEL_TRUSTED_PUBLIC_KEYS_JSON" | base64 | tr -d '\n')"

POSTGRES_PASSWORD_URLENCODED="$(node -p 'encodeURIComponent(process.argv[1]).replaceAll(String.fromCharCode(39), "%27")' "$POSTGRES_PASSWORD")"

if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

rm -rf /tmp/bss-source /tmp/bss.tar.gz
mkdir -p /tmp/bss-source /opt/bss
CYBERMAP_SOURCE_REVISION='__CYBERMAP_SOURCE_REVISION__'
CYBERMAP_SOURCE_TARBALL_URL='__CYBERMAP_SOURCE_TARBALL_URL__'
CYBERMAP_SOURCE_TARBALL_SHA256='__CYBERMAP_SOURCE_TARBALL_SHA256__'
if ! printf '%s' "$CYBERMAP_SOURCE_REVISION" | grep -Eq '^[a-f0-9]{40}$' || ! printf '%s' "$CYBERMAP_SOURCE_TARBALL_URL" | grep -Fq "/archive/${CYBERMAP_SOURCE_REVISION}.tar.gz" || ! printf '%s' "$CYBERMAP_SOURCE_TARBALL_SHA256" | grep -Eq '^[a-f0-9]{64}$'; then
  echo "Cybermap source provenance is invalid" >&2
  exit 1
fi
curl -fsSL "$CYBERMAP_SOURCE_TARBALL_URL" -o /tmp/bss.tar.gz
printf '%s  %s\n' "$CYBERMAP_SOURCE_TARBALL_SHA256" /tmp/bss.tar.gz | sha256sum --check --status
tar -xzf /tmp/bss.tar.gz -C /tmp/bss-source --strip-components=1
rm -rf /opt/bss/cybermap-api
cp -a /tmp/bss-source/vm/cybermap-api /opt/bss/cybermap-api
cd /opt/bss/cybermap-api
npm ci --omit=dev

install -d -m 0750 -o root -g root /etc/bss
install -d -m 0755 -o root -g root /etc/caddy
printf '%s' '__WARDIVER_MTLS_TRUST_CERT_PEM_B64__' | base64 -d > /etc/caddy/wardriver-mtls-trust.pem
chmod 0644 /etc/caddy/wardriver-mtls-trust.pem
if ! grep -q -- 'BEGIN CERTIFICATE' /etc/caddy/wardriver-mtls-trust.pem; then
  echo "Wardriver mTLS trust certificate is invalid" >&2
  exit 1
fi
(
  umask 077
  caddy_proxy_env_tmp="$(mktemp /etc/caddy/.bss-mtls-proxy.env.XXXXXX)"
  printf '%s\n' "BSS_MTLS_PROXY_SECRET=$BSS_MTLS_PROXY_SECRET" > "$caddy_proxy_env_tmp"
  chmod 0600 "$caddy_proxy_env_tmp"
  mv -f "$caddy_proxy_env_tmp" /etc/caddy/bss-mtls-proxy.env
)
install -d -m 0755 -o root -g root /etc/systemd/system/caddy.service.d
cat > /etc/systemd/system/caddy.service.d/bss-mtls-proxy.conf <<'UNIT'
[Service]
EnvironmentFile=/etc/caddy/bss-mtls-proxy.env
UNIT
chmod 0644 /etc/systemd/system/caddy.service.d/bss-mtls-proxy.conf

cat > /etc/bss/cybermap-api.env <<ENV
PGHOST=__POSTGRES_SERVER_FQDN__
PGPORT=5432
PGDATABASE=__POSTGRES_DATABASE_NAME__
PGUSER=__POSTGRES_ADMINISTRATOR_LOGIN__
PGPASSWORD=$POSTGRES_PASSWORD
PGSSLMODE=require
BSS_CYBERMAP_BIND_HOST=127.0.0.1
BSS_CYBERMAP_PORT=__CYBERMAP_API_PORT__
BSS_CYBERMAP_DB_POOL_MAX=4
BSS_CYBERMAP_READ_TOKEN=$CYBERMAP_READ_TOKEN
BSS_PAPER_STATE_TOKEN=$PAPER_STATE_TOKEN
BSS_MORNING_BRIEF_TOKEN=$MORNING_BRIEF_TOKEN
BSS_MTLS_PROXY_SECRET=$BSS_MTLS_PROXY_SECRET
ENV
printf 'DATABASE_URL=postgresql://__POSTGRES_ADMINISTRATOR_LOGIN__:%s@__POSTGRES_SERVER_FQDN__:5432/__POSTGRES_DATABASE_NAME__?sslmode=verify-full\n' "$POSTGRES_PASSWORD_URLENCODED" >> /etc/bss/cybermap-api.env
printf 'BSS_RAID_MODEL_TRUSTED_PUBLIC_KEYS_JSON_B64=%s\n' "$RAID_MODEL_TRUSTED_PUBLIC_KEYS_JSON_B64" >> /etc/bss/cybermap-api.env
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
run_migration 0003_paper_state db/migrations/0003_paper_state.sql
printf '{"revision":"%s","archive_sha256":"%s","installed_at":"%s"}\n' "$CYBERMAP_SOURCE_REVISION" "$CYBERMAP_SOURCE_TARBALL_SHA256" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > /etc/bss/cybermap-api-release.json
chmod 0644 /etc/bss/cybermap-api-release.json
run_migration 0004_godeye_global_cells_and_sources db/migrations/0004_godeye_global_cells_and_sources.sql
run_migration 0004_morning_brief_archive db/migrations/0004_morning_brief_archive.sql
run_migration 0005_device_scoped_observation_identity db/migrations/0005_device_scoped_observation_identity.sql
run_migration 0006_raid_model_lifecycle db/migrations/0006_raid_model_lifecycle.sql
run_migration 0007_raid_model_lifecycle_hardening db/migrations/0007_raid_model_lifecycle_hardening.sql
psql -v ON_ERROR_STOP=1 -c "UPDATE source_catalog SET enabled = true, allowed_preload = true, terms_reviewed = true, updated_at = clock_timestamp() WHERE source_key = 'deflock-osm-alpr-reports'"

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

cat > /etc/systemd/system/bss-deflock-source.service <<'UNIT'
[Unit]
Description=Blue Swallow DeFlock aggregate source job
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=/opt/bss/cybermap-api
EnvironmentFile=/etc/bss/cybermap-api.env
ExecStart=/usr/bin/node /opt/bss/cybermap-api/src/deflock-source-job.mjs
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
UNIT

cat > /etc/systemd/system/bss-deflock-source.timer <<'UNIT'
[Unit]
Description=Run Blue Swallow DeFlock aggregate source job every six hours

[Timer]
OnBootSec=5m
OnUnitActiveSec=6h
RandomizedDelaySec=5m
Persistent=true
Unit=bss-deflock-source.service

[Install]
WantedBy=timers.target
UNIT

cat > /etc/caddy/Caddyfile <<'CADDY'
__BACKEND_FQDN__ {
  encode zstd gzip
  reverse_proxy 127.0.0.1:__CYBERMAP_API_PORT__
}

__BACKEND_FQDN__:8443 {
  tls {
    client_auth {
      mode require_and_verify
      trust_pool file /etc/caddy/wardriver-mtls-trust.pem
    }
  }
  @wardriver_mtls_read {
    method GET
    path /api/v1/raid/models/catalog /api/v1/raid/models/releases/*/artifact
  }
  @wardriver_mtls_write {
    method POST
    path /api/v1/cybermap/viewport /api/v1/observations/batch /api/v1/raid/models/releases/*/feedback
  }
  handle @wardriver_mtls_read {
    reverse_proxy 127.0.0.1:__CYBERMAP_API_PORT__ {
      header_up X-Blue-Swallow-Mtls-Proxy-Secret {env.BSS_MTLS_PROXY_SECRET}
      header_up X-Blue-Swallow-Mtls-Client-Fingerprint {tls_client_fingerprint}
    }
  }
  handle @wardriver_mtls_write {
    reverse_proxy 127.0.0.1:__CYBERMAP_API_PORT__ {
      header_up X-Blue-Swallow-Mtls-Proxy-Secret {env.BSS_MTLS_PROXY_SECRET}
      header_up X-Blue-Swallow-Mtls-Client-Fingerprint {tls_client_fingerprint}
    }
  }
  respond "not_found" 404
}
CADDY
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

systemctl daemon-reload
systemctl disable --now echo-server.service || true
systemctl enable bss-cybermap-api.service
systemctl restart bss-cybermap-api.service
systemctl enable --now bss-deflock-source.timer
systemctl start bss-deflock-source.service
systemctl enable caddy.service
systemctl restart caddy.service
systemctl is-active --quiet bss-cybermap-api.service
systemctl is-active --quiet bss-deflock-source.timer
systemctl is-active --quiet caddy.service
