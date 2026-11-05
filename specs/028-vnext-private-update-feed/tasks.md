# Tasks: Private vNext update feed

- [x] Reconcile existing production release and owner-session boundaries.
- [x] Define the development receipt and stable immutable download routes with
  the private publisher.
- [x] Implement narrow bearer validation, bounded development store, and Function.
- [x] Run focused authorization, manifest, SAS, pointer-race, and production tests:
  55 pass. The complete public source gate passes 332 tests on Node 24; changed
  source maps pass markdownlint-cli2 0.18.1.
- [x] Accept the private publisher's generated manifest fixture in the Society
  reader and align version, artifact-size, and extension-source bounds.
- [x] Update current source and Functions maps with the new isolated boundary.
- [ ] Run the Functions image HTTP-host smoke gate in CI, including the new
  disabled index and nested download bindings.
- [ ] Qualify a Node 24 deployment path and provision protected runtime settings.
- [ ] Verify live private publication/downloads and physical Android/Bluetooth
  acceptance; retain this as pending until actual evidence exists.

- [x] Add an authenticated, validated current JSON receipt for native update clients; retain existing versioned downloads.
- [ ] Qualify deployed route, client credential provisioning, installed signer continuity and an actual Android update.
