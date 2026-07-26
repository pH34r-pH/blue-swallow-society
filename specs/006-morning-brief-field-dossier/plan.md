# 006 — Implementation Plan

1. Add RED tests for adapter probability bounds and a run validator that rejects stale/failed canonical state.
2. Implement adapter ingress validation and a `validated`/`withheld` morning package contract.
3. Add RED renderer tests derived from the retained Field Dossier manifest: required lanes, ordered pages, 1200x1500 PNGs, source-index/provenance, and forbidden-path redaction.
4. Implement the renderer and local publish/dispatch planner with hash-bound receipt persistence.
5. Add RED VM store/server tests for append-only package persistence, authorization, binary artifacts, conflict/replay semantics, and integrity failure.
6. Implement migration `0004_morning_brief_archive`, VM API methods/routes, in-memory test store, and install migration/token configuration.
7. Add RED SWA proxy/browser-module tests; then implement the private proxy and a dropdown-selected, scroll-snap carousel of authenticated, hash-verified dossier PNGs. Keep text/source metadata subordinate to the pages and permit only local `blob:` image URLs under CSP.
8. Add RED memory/PostgreSQL retention tests, then delete artifact children before expired archive parents inside the same successful archive transaction; retain exactly the seven newest daily runs.
9. Add deployment variables and workflow validation, run repository tests, rebuild Graphify, review the diff, and merge/deploy only from the clean branch.
10. Update the local scheduler wrapper/job only after live archive and operator API probes pass; run one fresh validated acceptance packet.
11. Add a local, fixed 78-card daily tarot curriculum to the collector. Select one record from the configured local date; include the same study record in Markdown, the cron packet, and a new deterministic Field Dossier lane. Do not introduce network, personalization, or divination behavior.
12. Add RED/GREEN collector and renderer tests for stable date selection, 78-day wrap, Markdown/packet preservation, and validated Tarot-lane coverage; then run focused regressions and refresh Graphify.
