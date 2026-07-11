# Cybermap Geospatial Backend P0 Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Keep the Cybermap backend implementation, repo docs, spec-kit artifacts, and vault note aligned around the actual P0 geospatial backend task graph.

**Architecture:** Cybermap uses a replaceable VM API/worker tier in front of PostgreSQL/PostGIS, with app-computed cells, source-class gates, authenticated ingest/read APIs, and provenance-rich Godeye/RaID/Greenfeed/Mosaic surfaces. This plan is a documentation/spec synchronization plan; final deployment still depends on the clean fan-in branch and GitHub CI/CD.

**Tech Stack:** Markdown spec-kit docs, Node.js built-in test runner for documentation guards, Azure Bicep references, PostgreSQL/PostGIS schema references, Obsidian vault mirrors.

---

## Current integration baseline

- Original review-approved branch: `kanban/cybermap-spec-kit-doc-sync` at `67c58b2`.
- Restoration branch: `kanban/cybermap-final-spec-kit-doc-sync`, based on the final integration candidate and restoring P0.16 artifacts.
- `main`/deployed baseline remains GitHub CI/CD-managed. The final integration candidate has many P0 slices merged, but P0.15 ops/cost controls and the other final-review remediations still need clean fan-in before completion.
- Completed/review-approved P0 implementation slices live in dedicated Kanban worktrees/branches; this plan records current-state vs target-state without pretending every remediation branch is already merged.
- Vault mirror: `/home/ph3/repos/blackbox/blackbox/Work/Blue Swallow Society/Documentation/Blue Swallow Society - Cybermap Geospatial Backend Design.md`.

## Implementation slices covered by this plan

### Task 1: Create spec-kit Cybermap backend specification

**Objective:** Add a Cybermap-specific spec-kit directory so implementation workers have a single requirements surface.

**Files:**
- Create: `specs/005-cybermap-geospatial-backend/spec.md`
- Create: `specs/005-cybermap-geospatial-backend/plan.md`
- Create: `specs/005-cybermap-geospatial-backend/tasks.md`

**Steps:**
1. Convert `docs/cybermap-geospatial-backend.md` into user stories, functional requirements, entities, API surface, and success criteria.
2. Include explicit current-state boundaries: main/deployed baseline, final integration candidate, review-approved branches, P0.15 merge cleanup, restored P0.16, and P0.17 remediation.
3. Include P0.00 through P0.17 implementation ledger entries, including P0.045, P0.055, P0.10a/b/c, and P0.125.
4. Include the parent-child task graph from the Kanban board.
5. Avoid secret values and avoid treating unmerged worktrees as deployed production state.

**Verification:**

Run:
```bash
node --test tests/cybermap-doc-sync.test.mjs
```

Expected: PASS, including assertions that the new spec files exist and include required P0 slices and source-class gates.

### Task 2: Link repo docs to the spec-kit surface

**Objective:** Make the spec discoverable from the primary repo documentation.

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/cybermap-geospatial-backend.md`
- Modify: `docs/azure-resources.md`
- Modify: `docs/vm-api.md`

**Steps:**
1. Add the Cybermap spec-kit path to the README repo layout.
2. Add a README section that distinguishes current main/deployed state from review-approved P0 branches.
3. Link `docs/architecture.md` to `specs/005-cybermap-geospatial-backend/spec.md` and summarize the P0 graph boundary.
4. Add a spec-kit/current-state section to `docs/cybermap-geospatial-backend.md`.
5. Link `docs/azure-resources.md` and `docs/vm-api.md` to the Cybermap spec so operators find the implementation graph from infra/API docs.

**Verification:**

Run:
```bash
node --test tests/cybermap-doc-sync.test.mjs
```

Expected: PASS, including assertions for spec links in README, architecture, Azure resources, VM API, and Cybermap design docs.

### Task 3: Add documentation regression test

**Objective:** Prevent future drift between backend design docs and spec-kit artifacts.

**Files:**
- Create: `tests/cybermap-doc-sync.test.mjs`

**Steps:**
1. Read the new spec, plan, tasks, README, and key docs.
2. Assert all required P0 slices are present.
3. Assert source-class gate and no-demo-runtime doctrine appear in spec/tasks/docs.
4. Assert repo docs link to `specs/005-cybermap-geospatial-backend/`.
5. Assert the current-state boundary appears so unmerged branch work is not presented as deployed.

**Verification:**

Run:
```bash
node --test tests/cybermap-doc-sync.test.mjs
node --test tests/*.test.mjs
```

Expected: targeted test passes and full Node test suite passes.

### Task 4: Mirror the update into the Obsidian vault

**Objective:** Keep the vault project note graph synchronized with the repo docs.

**Files:**
- Modify: `/home/ph3/repos/blackbox/blackbox/Work/Blue Swallow Society/Documentation/Blue Swallow Society - Cybermap Geospatial Backend Design.md`
- Confirm existing link: `/home/ph3/repos/blackbox/blackbox/Work/Blue Swallow Society/Documentation/Blue Swallow Society - Documentation Index.md`
- Append daily note: `/home/ph3/repos/blackbox/blackbox/Daily/2026-07-11.md`

**Steps:**
1. Add the repo spec-kit path and P0 implementation ledger boundary to the Cybermap vault note.
2. Confirm the Documentation Index already links the Cybermap Geospatial Backend note.
3. Append a daily log entry for the spec sync.
4. Do not delete vault content.

**Verification:**

Run/read:
```bash
git diff --check
node --test tests/*.test.mjs
```

Also inspect the vault note manually or with file reads to confirm links and daily log were appended.

### Task 5: Commit and hand off for review

**Objective:** Leave the worktree clean and provide a review-required Kanban handoff.

**Files:**
- All changed repo files above.

**Steps:**
1. Run the targeted docs test.
2. Run the full Node test suite.
3. Run `git diff --check`.
4. Scan the diff for obvious secret patterns and conflict markers.
5. Commit the repo changes on `kanban/cybermap-final-spec-kit-doc-sync`.
6. Add a Kanban comment with changed files, tests, commit, and vault files touched.
7. Block with `review-required:` because this is a repo change awaiting human review.

**Verification:**

Run:
```bash
git status --short --branch
git log --oneline -1 --decorate
```

Expected: worktree clean, branch points to the docs/spec sync commit.
