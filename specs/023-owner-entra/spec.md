# Owner-only companion authentication (#47)

The approved immutable owner signs in with Microsoft. All other identities are denied, including authenticated identities from another tenant or object ID. The public screen exposes login, denied, expired and unavailable states without private content. Missing configuration fails closed. Reload restores an unexpired owner session; Lock clears it. Private shell/assets/profile/release metadata/downloads and VM map reads require owner authorization. No platform principal header or device-only read credential grants owner access.

No real identity, registration, grant, live configuration, deployment, upload-identity replacement or data migration is in scope. Deployment remains blocked on docs/owner-entra-cutover.md acceptance and Android coordination. Historical paper APIs/data remain in place.
