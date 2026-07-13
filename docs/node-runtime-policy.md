# Node runtime policy

The repository uses the newest runtime supported by each execution surface.

| Surface | Version | Source of truth |
| --- | --- | --- |
| Local repository tooling | Node.js 24 | `.nvmrc` |
| VM Cybermap API | Node.js 24.x | `vm/cybermap-api/package.json`, `infra/scripts/install-cybermap-api.sh` |
| GitHub JavaScript actions | Node.js 24-native action majors | `actions/checkout@v7`, `azure/login@v3` |
| Azure Static Web Apps managed Functions | Node.js 22.x | `app/staticwebapp.config.json`, `api/package.json` |

Azure Static Web Apps managed Functions currently documents `node:22` as its newest supported `platform.apiRuntime` value. Do not set that surface to `node:24` until Azure adds managed-runtime support; doing so can break deployment. This platform constraint is unrelated to GitHub's “Node.js 20 is deprecated” annotation, which came from the runtime metadata in `actions/checkout@v4` and `azure/login@v2`.

When Azure adds managed Node.js 24 support, update all three together:

1. `app/staticwebapp.config.json` → `platform.apiRuntime: node:24`
2. `api/package.json` → `engines.node: >=24.0.0 <25`
3. `api/package-lock.json` → matching root package engine

`tests/runtime-versions.test.mjs` guards these pins against accidental regression.
