# Public validation and private deployment handoff

Society owns the public web app (`app/`), managed Functions (`api/`), and VM
Cybermap runtime (`vm/cybermap-api/`). [Wardriver](https://github.com/pH34r-pH/blue-swallow-wardriver)
will own the Azure infrastructure and the deployment workflow. The migration is
tracked in [Society #52](https://github.com/pH34r-pH/blue-swallow-society/issues/52),
[Wardriver #46](https://github.com/pH34r-pH/blue-swallow-wardriver/issues/46),
[Wardriver #47](https://github.com/pH34r-pH/blue-swallow-wardriver/issues/47),
and [Society #53](https://github.com/pH34r-pH/blue-swallow-society/issues/53).

## Current transition state

`Society public CI` validates pull requests and commits on `main` without an
Azure identity, deployment token, or private-repository secret. It uses public
GitHub-hosted runners. For now, the existing `Deploy Infra + App` workflow also
runs after pushes to `main`. The public Azure workflow and credentials must stay
in place until Wardriver has deployed and verified the equivalent private path;
their removal is Society #53. A green public CI run alone is **not** evidence of
a live deployment.

The two public CI job names are `society-app-and-functions` and `cybermap-api`.
The first runs the root app/Functions/source-contract tests on Node 22 with both
lockfile dependency trees installed. The second runs the VM API tests on Node 24.
The three root tests named `Obscura ...` require a separate browser CLI and are
excluded from this ordinary CI gate. Tests needing a disposable PostGIS server
are skipped unless `CYBERMAP_TEST_DATABASE_URL` is supplied; they are not part
of this public gate.

## Input to the private promoter

Wardriver should determine the candidate itself from Society's public `main`
ref, or accept a full 40-character SHA through its own private manual entrypoint.
It must verify that the SHA belongs to the intended `main` history and that
both named public CI jobs completed successfully **for that exact SHA**. Require
these checks on Society `main` in repository branch protection once the checks
appear. Do not use a successful run from a different SHA or a PR head as
promotion evidence.

Wardriver should fetch `https://github.com/pH34r-pH/blue-swallow-society/archive/<SHA>.tar.gz`,
calculate the SHA-256 of the downloaded bytes independently, and use that one
verified source identity for the SWA app, Functions, and Cybermap VM deployment.
The existing VM installer accepts a source revision, tarball URL, and tarball
SHA-256 and verifies the download. Record the Society SHA, public check run IDs,
archive digest, Wardriver infrastructure SHA, and Azure deployment result in the
private deployment evidence. The public repo publishes neither a privileged
dispatch token nor a mutable deployment URL. A private scheduled candidate
check can remove manual dispatch while keeping the decision in Wardriver.

The exact SHA and archive digest describe source provenance. The private
deployment must also record the *live* SHA only after its probes pass. To replay
or roll back, choose a previously validated Society SHA in Wardriver and verify
its checks and archive again; preserve database, storage, DNS, and resource
identity. Do not advance the recorded live SHA after a failed deploy.

## Remaining acceptance work

Wardriver #46 and #47 establish the private infrastructure and deployer, confirm
the actual GitHub/Azure trust and resource scope, exercise an exact-SHA
deployment, and probe the site, API, operator boundary, release metadata, and
basemap. Society #53 then removes this repo's Azure workflows, OIDC federation,
deployment token, and secrets. Public CI remains here after that cutover.
