# Public validation and private deployment handoff

Society owns the public web app (`app/`), managed Functions (`api/`), and
Cybermap runtime (`vm/cybermap-api/`). [Long-Haul Fleet](https://github.com/pH34r-pH/long-haul-fleet)
owns private hosting, DNS, deployment and recovery controls under the Fleet
[ownership index](https://github.com/pH34r-pH/long-haul-fleet/issues/630).
[Wardriver](https://github.com/pH34r-pH/blue-swallow-wardriver) owns the Android
product and device evidence. The migration and residual cutover gates are
tracked in [Society #148](https://github.com/pH34r-pH/blue-swallow-society/issues/148),
[Society #53](https://github.com/pH34r-pH/blue-swallow-society/issues/53),
[Society #55](https://github.com/pH34r-pH/blue-swallow-society/issues/55) and
[Fleet #1631](https://github.com/pH34r-pH/long-haul-fleet/issues/1631).

## Public validation

`Society public CI` validates pull requests and commits on `main` using
GitHub-hosted runners, without an Azure deployment identity or private-repository
secret. Its app/Functions, companion browser, Cybermap and database checks are
defined in [the workflow](../.github/workflows/public-ci.yml); consult that file
for the current job names, runtime and test scope. Public CI does not prove
that an artifact was promoted or that the live site serves it.

## Protected source and release handoff

Fleet's reviewed workflows and release records own candidate selection, exact
source and artifact identity checks, publication, live probes and recovery.
Follow their current pinned inputs and authorization gates rather than inferring
automatic promotion from a green public check. Bind any deployment evidence to
the exact Society source, the applicable release artifacts, Fleet revision,
environment and observed live result. Required public checks must match the
exact candidate SHA; a different SHA or PR head is not promotion evidence.
Record frontend and backend identities separately when they are released
together; a source SHA or successful build alone does not establish the served
pair or a tested rollback. Preserve database, storage, DNS and resource identity
during an approved recovery, and do not advance a live pointer after failure.

The retained Wardriver-managed Node 22 promoter is historical and cannot deploy
the current Node 24 Functions source. The protected Fleet hosting and paired
release paths are tracked by the ownership and recovery issues above. Do not embed private deployment tokens or add private-repository dispatch
authority to public source. See [the current source map](current-source-map.md) for the source
versus live-evidence boundary.

## Legacy public authority and remaining gates

The legacy `Deploy Infra + App` workflow remains in this repository as a
manual, main-only source path with an Azure OIDC permission. Its presence does
not prove that credentials remain valid or authorize a deployment. It can
reapply broad infrastructure and historical domain settings. Do not use it as
a routine promotion or assume it matches Fleet's current state.

[Society #53](https://github.com/pH34r-pH/blue-swallow-society/issues/53)
tracks removal of public workflows, secrets, federation and role assignments
after private parity and recovery are proven. [Society #55](https://github.com/pH34r-pH/blue-swallow-society/issues/55)
retains the canonical-origin and live-probe acceptance, with its later Fleet
authority reconciliation. Neither this document nor a source change performs
cutover, credential revocation, DNS changes, or production recovery.
