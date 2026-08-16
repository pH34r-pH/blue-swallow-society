# Test Design: Hermetic Root Contract Suite

| Requirement | RED condition | GREEN evidence |
|---|---|---|
| Bootstrap | root manifest/helper absent | `npm ci`, `npm run bootstrap`, root test command |
| Windows paths | URL pathname fed to `path.resolve()` | `fileURLToPath()` source contract |
| Python | `python3` hard-coded | resolver unit tests and mixed runtime contracts |
| Browser | absent binary causes ENOENT | default explicit skip; required capability fails diagnostic |
| CI parity | local bootstrap differs from CI | workflow source contract |
