import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const sessionModuleUrl = pathToFileURL(join(repoRoot, 'api/_private/operator/assets/operator-session.mjs')).href;
const morningBriefModuleUrl = pathToFileURL(join(repoRoot, 'api/_private/operator/assets/morning-brief.mjs')).href;

async function withMorningBriefModule(fn) {
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  globalThis.document = { getElementById: () => null };
  const session = await import(sessionModuleUrl);
  session.activateOperatorSession({
    token: 'artifact-integrity-test-token',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  try {
    const module = await import(`${morningBriefModuleUrl}?integrity-test=${Date.now()}`);
    await fn(module);
  } finally {
    session.clearOperatorSession();
    globalThis.fetch = previousFetch;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
}

function artifact() {
  return { artifact_id: 'synthetic-artifact', sha256: 'a'.repeat(64) };
}

test('Morning Brief artifacts require a normalized matching integrity header before blob creation', async () => {
  await withMorningBriefModule(async ({ fetchArtifact }) => {
    assert.equal(typeof fetchArtifact, 'function');

    for (const header of [null, 'not-a-sha256', 'b'.repeat(64)]) {
      globalThis.fetch = async () => new Response('synthetic artifact', {
        status: 200,
        headers: header ? { 'X-Blue-Swallow-Artifact-SHA256': header } : {},
      });
      await assert.rejects(
        () => fetchArtifact('run-2026-08-15', artifact()),
        /hash|integrity/i,
      );
    }

    globalThis.fetch = async () => new Response('synthetic artifact', {
      status: 200,
      headers: { 'X-Blue-Swallow-Artifact-SHA256': 'A'.repeat(64) },
    });
    const blob = await fetchArtifact('run-2026-08-15', artifact());
    assert.equal(await blob.text(), 'synthetic artifact');
  });
});
