# Index-bound Graphify provenance

- Source index tree: `366d0dc71312e565ffd15dfdbc2b5b255bf97fb5`
- Input boundary: a native Git archive of that source tree only; no ambient worktree or untracked path was scanned.
- Archive command: `git -c core.autocrlf=false -c core.eol=lf archive --format=tar <source-index-tree>`, extracted with Python `tarfile`.
- Archive/blob verification: PASS for 485 materialized blob paths.
- Graph parse: PASS (`nodes=6499`, `links=13817`).
- Manifest and labels JSON parse: PASS.
- Generated-artifact scan: PASS (no private-key block, Azure connection string, GitHub token, bearer value, ambient path, or temporary path).
- Generated artifacts: `.graphify_labels.json`, `GRAPH_REPORT.md`, `graph.json`, and `manifest.json`.
- Staged raw SHA-256 (exact Git blob bytes):
  - `graphify-out/.graphify_labels.json`: `b94a089b6f2203380f5fca073cca2412aae7503e86c48c077c00e6098121b94a`
  - `graphify-out/GRAPH_REPORT.md`: `90d296f331eb707457d40be28bf88ede8f89e82168d36226ed813873c70cd422`
  - `graphify-out/graph.json`: `4ae62cd6ae2fad83739f0113cd47abde0ab884ac2b0190cbe23d1d2685be73f5`
  - `graphify-out/manifest.json`: `5198748eda95dee4eea7198dea41305ec4bb74e977c2f40f8633dcd650e5f47b`
- Canonical graph SHA-256 (only node `community` removed; nodes/links/hyperedges sorted): `41c3a2d6a41c96251fd231a34c9435dfd3dc720b99c583670a4a946e650709a0`
- Canonical manifest SHA-256 (only `mtime` fields removed): `7d2ed1922af19563ddd686865455101a3536595ad767308b3eced49a9a63f056`
