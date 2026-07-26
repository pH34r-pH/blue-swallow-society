# Tasks: Wardriver MapLibre Basemap

- [x] Replace the policy-blocked public Blob container design with a `$web` static-website basemap path while preserving private release objects.
- [x] Add BSS style template, immutable vector-tile extractor, style renderer, and provenance-capable publisher workflow.
- [x] Check Bicep locally; run a Java 21 Planetiler canary and local static tests.
- [x] Prove OIDC data-plane access against private `wardriver-releases` before enabling `$web` or fetching inputs.
- [ ] Deploy the private toolchain container and stage its verified, checksum-pinned Planetiler `v0.10.2` JAR plus source provenance.
- [ ] Deploy infrastructure to Azure and run the protected first Washington publication.
- [ ] Verify live public style/tile delivery and private release-object denial.
- [ ] Build a signed `bss.15+` candidate using the BSS style endpoint.
- [ ] Complete physical Android acceptance.
- [ ] Tag and promote only after the physical gate.
