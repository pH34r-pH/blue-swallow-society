# Society documentation map

`docs/current-source-map.md` is the current source-state index. Link to it when
adding an operational or architecture note. Keep dated audits, scientific
research, proposals, and repair plans immutable unless the task explicitly
corrects their provenance; add a dated reconciliation note rather than silently
rewriting history.

Important local records:

- `static-web-app-functionality.md` — current web/API behavior and security boundary.
- `owner-entra-cutover.md` and `common-api-auth-contract.md` — Entra owner/API scope and cutover constraints.
- `entity-workbench-contract.md`, `entity-edit-authorization.md`, and `entity-workbench-validation.md` — entity read/edit contract and evidence.
- `public-ci-handoff.md` — public validation versus private deployment authority.
- `cybermap-geospatial-backend.md` — design and dated implementation notes; not deployment proof.
- `blue-swallow-system-implementation-delta.md` and `wardriver-raid-backend-repair-plan.md` — historical records; preserve their dates and status vocabulary.
- The explicit paper/scientific retained paths listed in
  [`scripts/check_documentation_artifacts.py`](../scripts/check_documentation_artifacts.py)
  — never reinterpret them as live execution. A future filename containing
  `-proposal`, `-research`, or `-paper-` remains a checkable living document
  until it is separately classified.

Route changes to the earliest authoritative artifact (`spec.md → plan.md →
tests.md → tasks.md`), then reconcile this map or the current source map. For
documentation-only work, run `git diff --check`, the relevant link/command
inspection, and the focused source tests named by the changed boundary. Do not
edit secrets, private corpora, generated Graphify output, or historical records
to make a current map pass.
