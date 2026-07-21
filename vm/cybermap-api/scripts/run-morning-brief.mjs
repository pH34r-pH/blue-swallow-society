#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
let runtime = null;

async function main() {
  runtime = {
    stateMaxAgeMinutes: positiveInteger(process.env.BSS_MORNING_BRIEF_STATE_MAX_AGE_MINUTES, 90),
    workRoot: process.env.BSS_MORNING_BRIEF_WORKDIR || '/var/lib/bss/morning-brief',
    backendBaseUrl: requiredHttpsUrl('BSS_MORNING_BRIEF_BASE_URL'),
    paperToken: requiredToken('BSS_PAPER_STATE_TOKEN'),
    briefToken: requiredToken('BSS_MORNING_BRIEF_TOKEN'),
    discordWebhookUrl: requiredHttpsUrl('BSS_DISCORD_MORNING_BRIEF_WEBHOOK_URL'),
  };
  const stateEnvelope = await requestJson('/api/v1/paper/state', { token: runtime.paperToken });
  const state = validateCanonicalState(stateEnvelope?.state);
  const stateAgeMs = Date.now() - Date.parse(state.generated_at);
  if (stateAgeMs < -60_000 || stateAgeMs > runtime.stateMaxAgeMinutes * 60_000) {
    throw new Error(`Canonical paper state is outside the ${runtime.stateMaxAgeMinutes}-minute dispatch window.`);
  }

  const canonicalStateJson = stableJson(state);
  const canonicalStateHash = sha256(canonicalStateJson);
  const runId = `morning-brief-${state.generated_at.slice(0, 10)}-${canonicalStateHash.slice(0, 12)}`;
  const generatedAt = new Date().toISOString();
  const workspace = join(runtime.workRoot, runId);
  const receiptPath = join(runtime.workRoot, 'receipts', `${runId}.json`);
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  await mkdir(join(runtime.workRoot, 'receipts'), { recursive: true, mode: 0o700 });

  const brief = buildBrief(state, { runId, generatedAt, canonicalStateHash, stateAgeMs });
  const svgPath = join(workspace, 'brief.svg');
  const pngPath = join(workspace, 'brief.png');
  const htmlPath = join(workspace, 'brief.html');
  const statePath = join(workspace, 'canonical-state.json');
  await Promise.all([
    writeFile(svgPath, renderSvg(brief), { mode: 0o600 }),
    writeFile(htmlPath, renderHtml(brief), { mode: 0o600 }),
    writeFile(statePath, `${canonicalStateJson}\n`, { mode: 0o600 }),
  ]);
  await execFileAsync('rsvg-convert', ['--format=png', '--output', pngPath, svgPath], { timeout: 30_000 });

  const artifacts = await Promise.all([
    artifact('brief-png', 'image/png', pngPath),
    artifact('brief-html', 'text/html; charset=utf-8', htmlPath),
    artifact('canonical-state-json', 'application/json; charset=utf-8', statePath),
  ]);
  const packageMetadata = {
    schema_version: 'bss.morning_brief.package.v1',
    run_id: runId,
    generated_at: generatedAt,
    canonical_state_hash: canonicalStateHash,
    summary: brief.summary,
    artifacts: artifacts.map(({ artifact_id, media_type, sha256: hash }) => ({ artifact_id, media_type, sha256: hash })),
  };
  const packageBody = {
    ...packageMetadata,
    package_sha256: sha256(stableJson(packageMetadata)),
    artifacts,
  };

  const existingReceipt = await readJsonIfPresent(receiptPath);
  if (existingReceipt?.status === 'delivered' && existingReceipt.package_sha256 === packageBody.package_sha256) {
    console.log(JSON.stringify({ ok: true, run_id: runId, dispatch: 'already_delivered', receipt: existingReceipt }, null, 2));
    return;
  }

  const archiveResponse = await requestJson('/api/v1/morning-briefs', {
    method: 'POST',
    token: runtime.briefToken,
    idempotencyKey: `${runId}:archive`,
    body: packageBody,
  });
  if (archiveResponse?.ok !== true) throw new Error('Private archive did not acknowledge the packet.');

  try {
    const dispatch = await dispatchDiscord({ pngPath, brief, packageBody });
    const receipt = {
      schema_version: 'bss.morning_brief.discord_receipt.v1',
      status: 'delivered',
      run_id: runId,
      package_sha256: packageBody.package_sha256,
      canonical_state_hash: canonicalStateHash,
      dispatched_at: new Date().toISOString(),
      discord_message_id: String(dispatch?.id || ''),
      discord_channel_id: String(dispatch?.channel_id || ''),
      discord_attachment_sha256: artifacts[0].sha256,
    };
    await atomicJson(receiptPath, receipt);
    console.log(JSON.stringify({ ok: true, run_id: runId, archived: archiveResponse.replayed ? 'replayed' : 'created', receipt }, null, 2));
  } catch (error) {
    await atomicJson(receiptPath, {
      schema_version: 'bss.morning_brief.discord_receipt.v1',
      status: 'failed', run_id: runId, package_sha256: packageBody.package_sha256,
      failed_at: new Date().toISOString(), error: error.message,
    });
    throw error;
  } finally {
    await rm(svgPath, { force: true });
  }
}

function validateCanonicalState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)
      || state.schema_version !== 'bss.paper_state.v3'
      || state.paper_only !== true || state.autonomous_execution !== true
      || !validTimestamp(state.generated_at)
      || !state.ledger || state.ledger.schema_version !== 4 || !Array.isArray(state.ledger.books)
      || state.ledger.books.length !== 24 || !Array.isArray(state.paper_books) || state.paper_books.length !== 24
      || state.governance?.paper_only !== true || state.governance?.no_real_money_execution !== true) {
    throw new Error('Canonical paper state did not satisfy the morning-brief integrity gate.');
  }
  const bookIds = new Set(state.ledger.books.map((book) => book?.book_id));
  if (bookIds.size !== 24 || !state.ledger.books.every((book) => typeof book?.book_id === 'string' && Number.isFinite(book.equity))) {
    throw new Error('Canonical paper ledger has incomplete or invalid book records.');
  }
  return state;
}

function buildBrief(state, { runId, generatedAt, canonicalStateHash, stateAgeMs }) {
  const books = state.ledger.books.slice().sort((a, b) => a.book_id.localeCompare(b.book_id));
  const actions = Array.isArray(state.paper_action_candidates) ? state.paper_action_candidates : [];
  const events = Array.isArray(state.recent_paper_trades) ? state.recent_paper_trades : [];
  const equity = books.reduce((total, book) => total + book.equity, 0);
  const costs = books.reduce((total, book) => total + (Number(book.transaction_costs) || 0), 0);
  const active = books.filter((book) => book.status === 'active').length;
  const buyCandidates = actions.filter((action) => action.action === 'PAPER_BUY' && action.risk_policy_passed === true).length;
  const blocked = actions.filter((action) => action.risk_policy_passed === false).length;
  const summary = `Verified canonical paper ledger: ${active}/24 active books, $${formatMoney(equity)} aggregate equity, ${buyCandidates} policy-passing buy candidates, ${blocked} blocked candidates, and ${events.length} recent paper fills. State age ${Math.round(stateAgeMs / 60_000)}m.`;
  return { runId, generatedAt, canonicalStateHash, stateGeneratedAt: state.generated_at, stateAgeMs, books, actions, events, equity, costs, active, buyCandidates, blocked, summary };
}

async function artifact(artifact_id, media_type, path) {
  const content = await readFile(path);
  return { artifact_id, media_type, sha256: sha256(content), content_base64: content.toString('base64') };
}

async function dispatchDiscord({ pngPath, brief, packageBody }) {
  const blob = new Blob([await readFile(pngPath)], { type: 'image/png' });
  const form = new FormData();
  form.set('payload_json', JSON.stringify({
    content: `**Mosaic / Murmurs — verified morning packet**\n\`${brief.runId}\` · canonical \`${brief.canonicalStateHash.slice(0, 16)}…\`\n${brief.summary}\nPrivate archive sealed before dispatch; package \`${packageBody.package_sha256.slice(0, 16)}…\`.`,
    allowed_mentions: { parse: [] },
  }));
  form.set('files[0]', blob, `${brief.runId}.png`);
  const response = await fetch(new URL('?wait=true', runtime.discordWebhookUrl), { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`Discord dispatch returned HTTP ${response.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return {}; }
}

async function requestJson(path, { method = 'GET', token, idempotencyKey, body } = {}) {
  const response = await fetch(new URL(path, runtime.backendBaseUrl), {
    method,
    headers: {
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json; charset=utf-8' } : {}),
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      ...(token === runtime.paperToken ? { 'x-blue-swallow-paper-state-token': token } : { 'x-blue-swallow-morning-brief-token': token }),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = null; }
  if (!response.ok) throw new Error(`Backend ${method} ${path} returned HTTP ${response.status}: ${payload?.error || text.slice(0, 300)}`);
  return payload;
}

function renderSvg(brief) {
  const rows = brief.books.map((book, index) => {
    const x = 62 + (index % 4) * 432;
    const y = 524 + Math.floor(index / 4) * 88;
    return `<g><rect x="${x}" y="${y}" width="408" height="66" rx="4" fill="#222823" stroke="#687268"/><text x="${x + 16}" y="${y + 25}" class="mono accent">${escapeXml(book.book_id)}</text><text x="${x + 16}" y="${y + 49}" class="mono">$${formatMoney(book.equity)} · ${escapeXml(book.status)}</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1180" viewBox="0 0 1800 1180"><style>.serif{font-family:Georgia,serif}.mono{font-family:monospace;font-size:18px;fill:#e9dfc8}.accent{fill:#9ec5b7}.muted{fill:#b6ad99}.big{font-size:62px;fill:#e9dfc8}.metric{font-size:32px;fill:#9ec5b7}</style><rect width="1800" height="1180" fill="#1b1f1b"/><path d="M0 18h1800" stroke="#9ec5b7" stroke-width="18"/><text x="62" y="96" class="mono accent">// BLUE SWALLOW SOCIETY · MOSAIC / MURMURS · PRIVATE OPERATOR PACKET //</text><text x="62" y="176" class="serif big">Morning Field Dossier</text><text x="62" y="218" class="mono muted">${escapeXml(brief.runId)} · rendered ${escapeXml(brief.generatedAt)}</text><rect x="62" y="266" width="1676" height="200" fill="#252c26" stroke="#687268"/><text x="96" y="320" class="metric">$${formatMoney(brief.equity)} aggregate paper equity</text><text x="96" y="372" class="mono">${brief.active}/24 active books · ${brief.buyCandidates} policy-passing buys · ${brief.blocked} policy blocks · $${formatMoney(brief.costs)} execution costs</text><text x="96" y="422" class="mono muted">canonical ${escapeXml(brief.canonicalStateHash)} · state ${escapeXml(brief.stateGeneratedAt)} · age ${Math.round(brief.stateAgeMs / 60000)}m</text><text x="62" y="506" class="mono accent">CANONICAL 3×8 PAPER LEDGER · SOURCE-BOUND, NO SYNTHETIC FALLBACK</text>${rows}<text x="62" y="1138" class="mono muted">Provenance: canonical VM paper-state snapshot. Private archive sealed before Discord dispatch.</text></svg>`;
}

function renderHtml(brief) {
  const rows = brief.books.map((book) => `<tr><td>${escapeHtml(book.book_id)}</td><td>$${formatMoney(book.equity)}</td><td>${escapeHtml(book.status)}</td><td>${escapeHtml(String(book.positions?.length || 0))}</td></tr>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>${escapeHtml(brief.runId)}</title><style>body{margin:40px;max-width:1000px;background:#1b1f1b;color:#e9dfc8;font:16px/1.5 system-ui}h1{font:42px Georgia,serif}code,th{color:#9ec5b7}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #596057;padding:8px;text-align:left}</style><p><code>// BLUE SWALLOW SOCIETY · MOSAIC / MURMURS · PRIVATE OPERATOR PACKET //</code></p><h1>Morning Field Dossier</h1><p><code>${escapeHtml(brief.runId)}</code></p><p>${escapeHtml(brief.summary)}</p><dl><dt>Canonical state hash</dt><dd><code>${escapeHtml(brief.canonicalStateHash)}</code></dd><dt>State generated</dt><dd>${escapeHtml(brief.stateGeneratedAt)}</dd><dt>Rendered</dt><dd>${escapeHtml(brief.generatedAt)}</dd></dl><table><thead><tr><th>Book</th><th>Equity</th><th>Status</th><th>Positions</th></tr></thead><tbody>${rows}</tbody></table><p><small>Provenance: canonical VM paper-state snapshot. Private archive sealed before Discord dispatch.</small></p>`;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function formatMoney(value) { return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function escapeXml(value) { return escapeHtml(value); }
function validTimestamp(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function positiveInteger(value, fallback) { const parsed = Number.parseInt(value || '', 10); return Number.isInteger(parsed) && parsed > 0 && parsed <= 720 ? parsed : fallback; }
function requiredToken(name) { const value = String(process.env[name] || '').trim(); if (!/^[A-Za-z0-9._~-]{32,256}$/.test(value)) throw new Error(`${name} is not a valid token.`); return value; }
function requiredHttpsUrl(name) { const value = String(process.env[name] || '').trim(); const url = new URL(value); if (url.protocol !== 'https:') throw new Error(`${name} must be HTTPS.`); return url; }
async function readJsonIfPresent(path) { try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error?.code === 'ENOENT') return null; throw error; } }
async function atomicJson(path, value) { const temp = `${path}.${process.pid}.tmp`; await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); await rename(temp, path); }

export { buildBrief, renderHtml, renderSvg, stableJson, validateCanonicalState };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
