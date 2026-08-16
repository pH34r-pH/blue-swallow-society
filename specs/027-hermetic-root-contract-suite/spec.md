# Feature Specification: Hermetic Root Contract Suite

**Feature Branch**: `fix/issue-35-hermetic-root-tests`
**Created**: 2026-08-15
**Status**: Active
**Input**: Society issue #35

## Requirements

1. A documented bootstrap installs the required Function test dependency without shell-global state. The VM suite keeps its Node 24 package contract.
2. `node --test tests/*.test.mjs` works on Windows after that bootstrap.
3. Node tests convert file URLs with `fileURLToPath()` before filesystem path use.
4. Python-backed tests use one platform-aware launcher. It supports `BSS_PYTHON`, `py -3`/`python` on Windows, and `python3`/`python` on POSIX.
5. Browser contracts are an explicit Obscura capability. The ordinary root suite skips them with a named reason when not provisioned; `BSS_REQUIRE_OBSCURA=1` fails closed.
6. CI runs the same bootstrap. A Windows job runs the ordinary suite; a tagged self-hosted Obscura job runs the browser suite with the gate enabled.

## Boundaries

No live service access and no browser runner installation occurs during this repair. Browser behavior remains tested only on a provisioned runner.
