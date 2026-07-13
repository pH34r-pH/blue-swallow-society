import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { validatePaperState } from '../vm/cybermap-api/src/server.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const producerScript = String.raw`
import json
from datetime import datetime, timezone
import mosaic_murmurs_paper_engine as engine
from mosaic_murmurs_paper_sync import build_paper_state
from paper_engine_test import fresh_snapshot

now = datetime(2026, 7, 13, 1, 0, tzinfo=timezone.utc)
result = engine.process_tick(
    engine.default_ledger(now),
    fresh_snapshot(now),
    now=now,
    run_idempotency_key="cross-runtime-contract",
)
state = build_paper_state(
    ledger=result["ledger"],
    paper_books=[engine.summarize_book(book) for book in result["ledger"]["books"]],
    actions=result["decisions"],
    events=result["events"],
    generated_at=now,
    recent_trades=[event for event in result["events"] if event.get("event_type") == "paper_fill"][-64:],
)
print(json.dumps(state, separators=(",", ":"), sort_keys=True))
`;

test('Python canonical producer and VM persistence validator share one executable schema-v4 contract', () => {
  const produced = spawnSync('python3', ['-c', producerScript], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
    env: {
      ...process.env,
      PYTHONPATH: [path.join(REPO_ROOT, 'scripts'), path.join(REPO_ROOT, 'tests')].join(path.delimiter),
    },
  });
  assert.equal(produced.status, 0, produced.stderr);
  const state = JSON.parse(produced.stdout);
  assert.equal(state.schema_version, 'bss.paper_state.v2');
  assert.equal(state.ledger.schema_version, 4);
  assert.equal(state.ledger.books.length, 24);
  assert.doesNotThrow(() => validatePaperState(state, Date.parse(state.generated_at)));
});
