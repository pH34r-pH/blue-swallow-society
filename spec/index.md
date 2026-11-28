---
schema_version: 1
document_id: blue-swallow-society/overview
role: overview
revision: 1
target_status: mature-complete-product
approval_status: proposed
artifact_acceptance: unspecified
delivery_status: designed-only
delivery_evidence: []
qualifiers: [living-spec-paradigm, spec-kit-mapped]
---

# Blue Swallow Society

Blue Swallow Society is a public birding journal with a separately loaded private companion, an owner-only entry, Azure Static Web Apps Functions and a Cybermap backend. This repository's behavior is described feature by feature in `specs/`, which stays in place as retained history and as the home of unmapped features.

This living specification is onboarded one area at a time. The [private bird-history import](features/bird-history/index.md) is the first specified area. Every other area, including the public journal feed, the companion, Cybermap ingest, Wardriver delivery and the owner interface, is explicitly unspecified here until it is onboarded; its authority remains the matching `specs/<NNN-feature>/` package.
