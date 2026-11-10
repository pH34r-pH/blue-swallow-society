# Society vNext foundation

This is partial source implementation for issues #47, #46, #41 and #121 within #85, dated
2026-11-10. See the [current source map](current-source-map.md) and
[feature contract](../specs/031-society-vnext/spec.md). The journal layout,
password dialog, isolated desktop shell and private development download card
are implemented in source. The browser dataset reader, populated map/history
views and real bird import/publication flow remain pending. The root is now
public-first; Entra owner entry is retained at `/owner`.

## Authorization and delivery

`BLUE_SWALLOW_AUTH_MODE=password` explicitly enables the new viewer contract.
The default remains `entra` during integration. Entra owner step-up remains
available in password mode; existing owner APIs do not accept viewer tokens.

| Endpoint | Method | Contract |
| --- | --- | --- |
| `/api/companion-auth/login` | POST | Same-origin JSON password; atomic global and caller reservations before scrypt; durable session before success |
| `/api/companion-auth/session` | GET | Restore an unexpired signed token after a durable state check; no idle renewal |
| `/api/companion-auth/renew` | POST | Same-origin empty JSON body; conditional idle renewal, bounded by absolute expiry |
| `/api/companion-auth/logout` | POST | Same-origin empty JSON body; durable revocation before cookie clearing/success |
| `/api/companion-ui/{asset}` | GET/HEAD | Isolated fixed viewer-safe shell/module/style allowlist, after authorization |
| `/api/bird-journal` | GET/HEAD | Public approved-field projection; initial publication is empty |
| `/api/companion-downloads/current.json` | GET/HEAD | Authenticated metadata validated as the private vNext channel |
| `/api/companion-downloads/{versionCode}/{sourceCommit}/{fileName}` | GET/HEAD | Exact immutable receipt, listed APK or paired FAP; fresh five-minute HTTPS read-only Blob grant |

All responses are private/no-store. The viewer cookie is host-only, Secure,
HttpOnly and SameSite=Strict. Tokens have a distinct purpose and bind the
password verifier, session key, revocation epoch, origin and configured group.
Changing any of those invalidates existing viewer sessions. An absent group
does not imply access to any dataset. Password-mode guards reject empty,
duplicate, malformed or conflicting explicit credentials rather than borrowing
an owner cookie. Viewer authorization is asynchronous because it checks Azure
Table state on every accepted request. The retained synchronous operator guard
remains owner/legacy-only.

Logout invalidates all tokens issued for that session, including tokens issued
by renewal. Renewal cannot recreate a deleted row. The idle limit is 15 minutes
and the absolute limit is eight hours. A storage outage returns unavailable;
there is no process-memory fallback or stale-session grace period. Already
issued artifact SAS grants retain their five-minute residual lifetime.

The download facade reuses the development manifest validator and exact-artifact
grant path. It never exposes a machine-feed bearer or changes the machine feed's
authentication. Viewer passwords do not authorize device membership, device
writes, entity correction or bird publication. Legacy production APK delivery
continues through its separate existing validator.

## Protected configuration

Set these only through the protected hosting configuration. Do not commit real
values or place passwords in command-line arguments, browser bundles or logs.

| Setting | Requirement |
| --- | --- |
| `BLUE_SWALLOW_AUTH_MODE` | Explicit `password`; no automatic legacy digest fallback |
| `BLUE_SWALLOW_PUBLIC_ORIGIN` | Exact HTTPS origin without a trailing path/slash |
| `BLUE_SWALLOW_VIEWER_PASSWORD_SCRYPT` | `scrypt$131072$8$1$` followed by a 32-character lowercase hex salt and 64-character lowercase hex digest, separated by `$` |
| `BLUE_SWALLOW_VIEWER_SESSION_KEY` | Independent random 32-byte key encoded as canonical unpadded base64url |
| `BLUE_SWALLOW_VIEWER_SESSION_EPOCH` | Explicit 1–64-character alphanumeric/underscore/hyphen revocation generation |
| `BLUE_SWALLOW_VIEWER_SESSION_STORAGE_CONNECTION_STRING` | Private Azure Table connection, never sent to the browser |
| `BLUE_SWALLOW_VIEWER_SESSION_TABLE` | Optional table name; defaults to `viewerSessions` |
| `BLUE_SWALLOW_PASSCODE_RATE_LIMIT_STORAGE_CONNECTION_STRING` | Existing private atomic rate-limit storage; required for login |
| `BLUE_SWALLOW_PASSCODE_RATE_LIMIT_TABLE` | Existing optional table name; defaults to `passcodeFailures` |
| `BSS_WARDRIVER_SYNC_GROUP_ID` | Optional explicit group binding; changing it invalidates sessions |

The server-side `encodePassword` helper in `api/_lib/viewer-session.js` creates
the fixed-cost verifier from a privately supplied password of 12–1024 UTF-8
bytes. The old SHA-256 digest cannot be converted back into a password. A new
verifier must be generated privately when the deployment is authorized.
The separate existing Entra owner and development artifact settings remain
required for their respective features.

Provision both private tables before activation; the application never creates
resources implicitly. Session rows store a hash of a random session reference,
generation and expiry metadata. Login reserves at most 30 global attempts per
five minutes, plus the existing caller limit (default five). Successful logins
also consume the quota. Two concurrent KDF operations per process bound memory;
excess concurrent work returns unavailable. Shared-password rotation affects
the whole friend cohort; this is not per-friend identity or revocation.

Table operations use bounded cancellation. `viewer-session-cleanup` runs every
15 minutes, reads at most 200 expired rows and deletes by ETag under a ten-second
budget. Concurrently renewed rows survive. Monitor timer failures and backlog;
expiry is enforced during authorization even if cleanup is delayed. The timer
requires the qualified Node 24 Functions host and its host storage. Do not route
this build through the retained Node 22 managed-SWA promoter.

## Rollout and evidence

The source now integrates public login and a separate private shell, but this
does not establish a deployed cutover or a working shared map. First qualify the exact source build
on the Node 24 host, provision protected configuration/tables, and verify that
anonymous reads fail before private storage access. Then test same-origin login,
restore, renewal, logout/replay, rotation, wrong-owner rejection, unavailable
storage, private metadata and exact signed artifact grants. Preserve Entra owner
step-up and separate machine/device credential tests. No such live deployment,
credential provisioning, bird connection or physical installation is claimed by
this source change.

Focused synthetic checks are:

```bash
node --test tests/viewer-session.test.mjs tests/companion-auth.test.mjs tests/companion-downloads.test.mjs tests/passcode-rate-limit.test.mjs
node --test tests/owner-auth.test.mjs tests/entity-edit-auth.test.mjs tests/wardriver-development-api.test.mjs tests/wardriver-development-store.test.mjs tests/wardriver-sync-auth.test.mjs
```

Related repairs update MSAL Node from 7.0.0 to 7.2.1 for
[the upstream authorization-code advisory](https://github.com/AzureAD/microsoft-authentication-library-for-js/security/advisories/GHSA-xcx6-jx8p-x3h5).
Windows checks now use file URLs for dynamic module imports, the installed
Python executable and native filesystem conversion. `.gitattributes` preserves
the vendored Cesium bytes covered by its pinned integrity manifest.

To disable new viewer entry during an incident, return to the retained `entra`
mode and invalidate viewer sessions by changing the protected epoch before any
later reactivation. This does not revoke previously issued Blob grants. Never
fall back to legacy password validation automatically.
