# Tests

Real local RSA signatures verify each scope and reject wrong tenant/object/issuer/audience, array audience, expiry/not-before, app-only, ID/session tokens and malformed headers. Actual HTTP read tests assert denial before store calls. Thin API guard/cache tests cover no-store denials, frozen principals, scope requests, expiry and logout. Root/VM/browser/image/structural CI must pass at final head. Tests use synthetic identities and do not prove live Entra provisioning or consent.
