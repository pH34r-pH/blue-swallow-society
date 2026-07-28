import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const installer = new URL('../../../infra/scripts/install-cybermap-api.sh', import.meta.url);

test('installer creates an isolated mTLS listener that overwrites client-controlled proxy headers', async () => {
  const source = await readFile(installer, 'utf8');
  assert.match(source, /__BACKEND_FQDN__:8443/);
  assert.match(source, /require_and_verify/);
  assert.match(source, /install -d -m 0755 -o root -g root \/etc\/caddy/);
  assert.match(source, /\/etc\/caddy\/wardriver-mtls-trust\.pem/);
  assert.doesNotMatch(source, /\/etc\/bss\/wardriver-mtls-trust\.pem/);
  assert.match(source, /\(\n  umask 077\n  caddy_proxy_env_tmp="\$\(mktemp \/etc\/caddy\/\.bss-mtls-proxy\.env\.XXXXXX\)"\n  printf '%s\\n' "BSS_MTLS_PROXY_SECRET=\$BSS_MTLS_PROXY_SECRET" > "\$caddy_proxy_env_tmp"\n  chmod 0600 "\$caddy_proxy_env_tmp"\n  mv -f "\$caddy_proxy_env_tmp" \/etc\/caddy\/bss-mtls-proxy\.env\n\)/);
  assert.doesNotMatch(source, /printf '%s\\n' "BSS_MTLS_PROXY_SECRET=\$BSS_MTLS_PROXY_SECRET" > \/etc\/caddy\/bss-mtls-proxy\.env/);
  const caddyDropIn = source.match(/cat > \/etc\/systemd\/system\/caddy\.service\.d\/bss-mtls-proxy\.conf <<'UNIT'\n([\s\S]*?)\nUNIT/);
  assert.ok(caddyDropIn, 'the installer must define the Caddy environment drop-in');
  assert.match(caddyDropIn[1], /EnvironmentFile=\/etc\/caddy\/bss-mtls-proxy\.env/);
  assert.doesNotMatch(caddyDropIn[1], /\/etc\/bss\/cybermap-api\.env/);
  assert.match(source, /header_up -X-Blue-Swallow-Mtls-Proxy-Secret/);
  assert.match(source, /header_up X-Blue-Swallow-Mtls-Proxy-Secret/);
  assert.match(source, /header_up X-Blue-Swallow-Mtls-Client-Fingerprint \{tls_client_fingerprint\}/);
  assert.match(source, /handle \@wardriver_mtls/);
  assert.match(source, /respond "not_found" 404/);
  assert.match(source, /systemctl daemon-reload[\s\S]*systemctl restart caddy\.service/);
});
