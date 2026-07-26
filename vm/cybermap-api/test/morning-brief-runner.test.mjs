import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBrief, renderHtml, renderSvg, stableJson, validateCanonicalState } from '../scripts/run-morning-brief.mjs';

function canonicalState() {
  const books = Array.from({ length: 24 }, (_, index) => ({
    book_id: `line-${Math.floor(index / 8)}__strategy-${index % 8}`,
    equity: 2_000 + index,
    status: index === 23 ? 'crashed' : 'active',
    positions: [],
    transaction_costs: index / 10,
  }));
  return {
    schema_version: 'bss.paper_state.v3',
    paper_only: true,
    autonomous_execution: true,
    generated_at: '2026-07-21T13:00:00.000Z',
    ledger: { schema_version: 4, books },
    paper_books: books.map((book) => ({ book_id: book.book_id })),
    paper_action_candidates: [
      { action: 'PAPER_BUY', risk_policy_passed: true },
      { action: 'PAPER_SELL', risk_policy_passed: false },
    ],
    recent_paper_trades: [{ event_id: 'fill-1' }],
    governance: { paper_only: true, no_real_money_execution: true },
  };
}

test('morning brief renderer uses only a complete canonical paper state and emits provenance-bound artifacts', () => {
  const state = validateCanonicalState(canonicalState());
  const brief = buildBrief(state, {
    runId: 'morning-brief-2026-07-21-123456789abc',
    generatedAt: '2026-07-21T13:05:00.000Z',
    canonicalStateHash: 'a'.repeat(64),
    stateAgeMs: 5 * 60 * 1000,
  });
  assert.match(brief.summary, /23\/24 active books/);
  assert.match(renderSvg(brief), /SOURCE-BOUND, NO SYNTHETIC FALLBACK/);
  assert.match(renderHtml(brief), /canonical VM paper-state snapshot/);
});

test('canonical-state validation rejects incomplete or non-paper state', () => {
  const incomplete = canonicalState();
  incomplete.ledger.books.pop();
  assert.throws(() => validateCanonicalState(incomplete), /integrity gate/);
  const nonPaper = canonicalState();
  nonPaper.governance.no_real_money_execution = false;
  assert.throws(() => validateCanonicalState(nonPaper), /integrity gate/);
});

test('stable JSON is key-order invariant for canonical state hashing', () => {
  assert.equal(stableJson({ b: [2, 1], a: { z: true, c: null } }), stableJson({ a: { c: null, z: true }, b: [2, 1] }));
});
