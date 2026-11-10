# Society vNext validation

## Authentication and release seam

Use generated synthetic keys/passwords and an ETag-enforcing table fake. Cover
correct/wrong/oversized password, malformed verifier/configuration, global and
caller throttle, storage outage, session expiry, renewal at the absolute bound,
logout versus renewal, rotation, token tampering, purpose confusion, Origin,
method/body limits, and denial before private storage access. Exercise real
handlers, not just string inspection. Existing owner, device and machine-feed
tests must continue passing.

For browser downloads, verify authorization before store construction, exact
package/channel/signer validation, immutable version/source binding despite
latest changes, APK/FAP allowlisting, missing release and private/no-store HEAD.

## Public and private browser journeys

Test root remains public with a session; explicit Login; wrong password; safe
return routes; session restore on private deep link; owner step-up; lock across
tabs; expired/failed bootstrap; private memory and DOM teardown. Inspect actual
rendered layouts, keyboard focus, 200% zoom, reduced motion and WebGL fallback.

## Data and birding

Android/browser golden fixtures must agree at a shared revision on admitted
facts, subject identity, uncertainty and contributor scope. Exercise signatures,
conflicts, retraction/cutoffs, unknown wire versions and bounded interruption.
Bird imports require idempotence/corrections, presence-only counts, private draft
isolation, explicit publication and complete unpublish from all public outputs.

## Launch evidence

Record exact source/artifact/runtime versions. Verify live auth/storage rules
and signed artifact download separately, then real phone fresh install/update,
local recording and invited contribution. Tests or fixtures never substitute
for the required host or physical-device evidence in #124.
