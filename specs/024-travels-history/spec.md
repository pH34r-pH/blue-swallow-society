# Persistent observation history (#42/#43)

The verified owner queries immutable personal observations by UTC time interval, producer installation, stored session and radio kind. Results are ordered by exact capture timestamp and canonical observation UUID, use bounded keyset pages, and omit raw radio identifiers/payload/provenance. Missing measurements remain null. Public/DeFlock records cannot enter this history. Stored session IDs identify observation-backed groups; absent IDs stay ungrouped. Page groups are not complete trips or inferred entities.

Travels offers an accessible chronological list, selected detail and optional MapLibre capture-point view sharing canonical IDs. Filter/selection URLs restore after reload and Back without placing coordinates or RF identifiers in URLs. Selection not on the page is fetched within the same filters. Empty/error/stale results are explicit; failed or superseded loads cannot masquerade as fresh data. No automatic geolocation or current-viewport dependency exists.

No schema migration, entity mutation, device onboarding, live data or deployment. Standard delegated API migration targets Owner.Read, but this read-only increment uses the existing verified-owner read boundary. No new scopes or write proofs.
