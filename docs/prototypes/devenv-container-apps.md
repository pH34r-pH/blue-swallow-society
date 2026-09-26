# Society devenv / Container Apps prototype

This branch is intentionally non-production. It tests whether standard devenv
modules can express Society's Node 24, npm, PostgreSQL and PostGIS development/
CI environment without a Fleet-specific requirements description.

The prototype deliberately does **not** containerize the current `api/` tree
yet. That code is structured as Azure Functions handlers. A linked Azure
Container Apps backend needs an ordinary HTTP container entrypoint while
preserving the existing `/api/*` behavior and Static Web Apps authorization
boundary. That application adaptation is tracked separately in #64.

The environment uses:
- devenv's JavaScript module with `pkgs.nodejs_24`;
- the repository's npm lockfiles as dependency authority;
- devenv's PostgreSQL service and standard PostGIS extension;
- the existing root and Cybermap tests.

A passing prototype means this small configuration replaces environment
inventory code. It does not prove the Container Apps deployment, SWA linkage,
production authentication, or a release artifact.

If this branch reaches a clean `devenv test`, the next experiment is to add the
small HTTP adapter from #64 and use devenv's standard OCI container support (or
an ordinary upstream-style Dockerfile if it is simpler). We should not create a
custom Nix module or container builder.

Input locking is intentionally deferred until the first successful evaluation.
The normal devenv workflow will create `devenv.lock`; if the prototype is
accepted, that lock becomes the reproducibility input rather than a parallel
custom version manifest.
