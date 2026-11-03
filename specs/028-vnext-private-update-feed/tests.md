# Validation Design: Private vNext update feed

| Requirement | Behavioral evidence |
|---|---|
| FR-001–003 | Missing, malformed, wrong, and rotated credentials fail before store creation; cookies, query values, and platform headers are insufficient; disabled configuration fails closed. |
| FR-004–006 | Exact vNext schema, signer, package, version, source, immutable paths, APK/FAP hashes and sizes; reject traversal, mismatched requested release, unknown files, and malformed timestamps. |
| FR-006 | Changing current pointer after index retrieval still resolves the requested immutable release; old release failure does not fall back to current. |
| FR-007 | SDK-generated SAS uses one approved Blob, read-only permission, HTTPS, and five-minute expiry; APK/FAP bodies are never requested by Functions. |
| FR-008 | HTML has one versioned APK link and matching FAP/receipt links, no SAS/token, and private/no-store headers; HEAD has no body. |
| FR-009 | Existing production operator-download tests continue to pass; new reader credentials do not satisfy production authorization. |
| FR-010 | Configuration and deployment instructions explicitly retain signer continuity, first client install/consent, and separate live acceptance. |

Run on the repository's Node 24 runtime:

```bash
npm ci --prefix api --ignore-scripts --engine-strict
node --test tests/wardriver-development-api.test.mjs tests/wardriver-development-store.test.mjs tests/operator-downloads-api.test.mjs
git diff --check
```

After qualified deployment, verify anonymous and wrong-token requests cannot
read any private data; the authenticated index and immutable receipt agree with
the private publisher; APK/FAP SAS downloads match recorded hashes and sizes;
expired grants fail; the old production path retains its existing policy. Use
the physical phone for the first approved Obtainium update and later background
update, then test Wardriver's Bluetooth FAP installation separately.
