# Common API delegated tokens (#47/#42)

Implement the agreed single-tenant v2 API resource with Owner.Read, Observations.Upload and Entities.Write. Validate Microsoft signature, exact issuer/audience/tenant/object, exp/nbf and operation scope. Reject app-only, ID tokens, forged principals and application sessions on this API boundary. Return immutable owner context. Preserve capture/storage correctness and installation identity separately. Source changes only; live acceptance remains blocked as documented in docs/common-api-auth-contract.md.
