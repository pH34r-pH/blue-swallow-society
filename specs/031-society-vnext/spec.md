# Society vNext

Status: implementation in progress. Owner direction: 2026-11-10, issue #85.

This package supersedes the default public owner-login direction in spec 023
and the earlier companion navigation where they conflict. Historical validation
records remain unchanged. It does not establish deployment or phone acceptance.

## Required experience

1. The root is a real birdwatching journal (#121), including approved history
   from an import-first eBird/Merlin workflow (#122). Authored posts, archives,
   species views and public feeds contain only an explicit public projection.
   Raw imports remain private. Unsupported account sync is never claimed.
2. Login on the journal accepts a password and explicitly opens the companion
   (#47). Visiting the root with a valid session never automatically reveals it.
   Logout, expiry and failed bootstrap clear private content.
3. The desktop companion uses Vector Edge and Map, Encounters, Trips and
   Downloads & Devices (#41/#48), with resizable panels, accessible keyboard
   alternatives and progressive technical detail.
4. A read-only browser reader consumes the updated device-owned shared datasets
   (#42). It preserves signed provenance, contributor ownership, withdrawal,
   revision and uncertainty semantics. It does not impersonate a phone or make
   old Cybermap data into the current shared corpus.
5. Map controls, filtering, density, uncertainty, time/contributor scope and
   bounded queries (#43) share identity with the inspector and trip/encounter
   views (#123). Unsupported summaries remain unavailable.
6. Authenticated friends can obtain the correctly labeled private vNext APK and
   matching extension (#46), independently of invited device contribution.
   A stable phone-page link carries no password or download grant; after login it
   returns the friend to downloads. The page identifies the selected release,
   provides installation and update guidance, and can check for a newer build.
   Existing production and development validators remain distinct.
7. Friends using the shared password can inspect supported shared entities and
   evidence read-only (#123). Entity corrections (#44), bird publication and
   other administration require the owner's Entra identity; the password never
   authorizes them. Microsoft sign-in starts only on explicit Admin login inside
   the operator site. Reading does not wait for correction synchronization.
8. Integrated browser, hosting, artifact and physical friend-pilot evidence
   (#124) is required before launch completion.

## Initial site cutover

On 2026-11-10 Pacific, the owner authorized replacing the current site with the
implemented vNext release before the full friend pilot. There are no users yet;
a rollback plan or rehearsal is not a gate for this cutover. Pair the exact
frontend and backend source, configure the protected authentication/storage
boundaries, and verify public/private separation on the canonical origin.
Unfinished views remain unavailable, and empty public content must not be filled
with synthetic history. Cutover does not complete the remaining feature or
physical-device acceptance above.

## Password session contract

The new `password` auth mode is explicit during source integration. `entra` and
`legacy` retain their existing migration behavior until the public entry cutover.
Entra remains available for owner step-up in password mode. Viewer credentials
are accepted only by an explicit asynchronous companion guard, never by the
existing synchronous owner/operator guard or device/update-feed guards.

Passwords use fixed-cost asynchronous scrypt (N=131072, r=8, p=1), a random
16-byte salt and a 32-byte digest. Configuration contains the encoded verifier,
an independent random 32-byte session key and a revocation epoch. To preserve an
existing password without recovering it, an authorized protected process may
derive a versioned scrypt verifier over the raw bytes of the existing SHA-256
digest. Login applies the same SHA-256 preprocessing to the submitted password.
The SHA-256 digest is sensitive and must not enter source, logs or the browser;
the new verifier does not contain it. Fresh passwords use ordinary scrypt. Neither
format adds a legacy owner credential or a SHA-256-only fallback.

Sessions use a Secure HttpOnly SameSite=Strict host cookie and a memory-only
explicit header for private module requests. The signed purpose-typed token is
valid for at most 15 minutes. Durable server state imposes a 15-minute idle and
eight-hour absolute lifetime. Explicit same-origin renewal extends idle life
but never the absolute lifetime. Each accepted private request checks durable
state; logout revokes the session before reporting success. Already issued
artifact SAS grants retain their existing five-minute residual lifetime.

All password mutations require exact configured Origin, JSON bodies bounded to
4 KiB, and fixed action/method allowlists. Existing atomic per-caller throttling
plus an independent global ceiling reserve attempts before KDF work. Limiter,
configuration or session storage failure denies access. Renewal uses ETag CAS;
logout cannot be undone by a racing renewal. Password/key/epoch/group changes
invalidate prior sessions. Shared-password rotation affects the whole cohort.

The server session table stores only random session references, revocation
generation and expiry metadata. A bounded scheduled cleanup removes expired
entries. There is no in-memory authorization fallback in production.

Sign-in entry requests must leave their pending state within a bounded time and
offer a retry after service failure. A late session restore must not overwrite
a newer explicit sign-in attempt. The password dialog describes a rejected
password only when the API explicitly returns `invalid_password`; a platform
authorization or session error does not establish that the password was wrong.

## Authority matrix

| Principal | Allowed | Explicitly excluded |
| --- | --- | --- |
| Anonymous | Published journal and Login | Private shell, datasets, releases |
| Password viewer | Companion shell, configured shared reads/entity inspection and download facade | Unshared legacy owner corpus, entity writes, publication, device writes |
| Entra owner | Retained owner scopes and owner admin | Device impersonation |
| Device proof | Existing invited device capabilities | Browser/owner administration |
| Update reader | Existing development feed | Companion/data/admin APIs |

No principal is inferred from a client-supplied role or platform header. A
conflicting explicit credential must not fall through to a more privileged
cookie. Private responses are no-store; session tokens never enter URLs. Only
the existing exact-blob, five-minute artifact SAS is returned as a download
redirect; it must not appear in public markup, logs or persistent browser state.
