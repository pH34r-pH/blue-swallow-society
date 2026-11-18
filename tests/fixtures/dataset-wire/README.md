# Android dataset fixtures

`producer-golden.json` covers the original live and closed wire formats, optional control fields and unknown observation bytes.

`sighting-withdrawal-v1.json` comes from an installed Wardriver API 36 test at producer revision `b2246dceea00e616423ebe52b1b2c217721116b7`. The first signed publication contains a synthetic operator sighting from a closed session. The writer applied Undo after the first acknowledgment, reopened its database and published a signed retraction scoped to the same publisher. The JSON contains the public verification key, both heads and their objects, SHA-256 hashes, and Android’s observed states before Undo, after Undo and on replay.

Run `node --test tests/dataset-wire.browser.mjs` with the repository’s browser-test dependencies. Chromium verifies the signed chain, applies the retraction, and compares its results with Android’s. The test then limits the publisher to its first commit and verifies that the original bytes and provenance are recoverable with the object transport empty.

The fixture uses dataset version 1. The relevant wire records are an external operator observation and a DatasetRetraction. The local Android correction is separate evidence. The browser retains the signed control bytes, including newer optional accounting data, without using those fields to decide withdrawal eligibility.

To generate another sample, run `SightingCorrectionStoreTest#exportPublishedSightingAndWithdrawal` with the producer revision as the `withdrawalFixtureProducer` instrumentation argument. The test generates a fresh signer and fresh record IDs. Verify a saved sample against its own hashes. Running the consumer tests requires only the files in this repository.
