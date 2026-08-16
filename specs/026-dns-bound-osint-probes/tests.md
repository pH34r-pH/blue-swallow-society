# Test Design: DNS-Bound OSINT HTTPS Probes

| Requirement | RED condition | GREEN evidence | Test |
|---|---|---|---|
| DNS rejection | private answer reaches requester | requester is never called | `osint-api.test.mjs` |
| DNS binding | public lookup does not reach transport lookup | transport lookup returns the vetted IP and retains hostname/SNI | `osint-api.test.mjs` |
| Peer validation | private/mismatched peer is accepted | bounded public-target failure | `osint-api.test.mjs` |
| Deadline | a peer emits small chunks forever | absolute request deadline rejects and destroys transport | `osint-api.test.mjs` |
| Redirect safety | private redirect reaches requester | only first public URL is requested | `osint-api.test.mjs` |
| IPv4-mapped IPv6 | private mapped address passes lexical checks | private mapped addresses are rejected | `osint-api.test.mjs` |

No live DNS or network target is contacted by this suite.
