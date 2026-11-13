# Society runtime reconciliation — 2026-11-13 UTC

The canonical site uses the protected private-network Functions replacement.
The linked v1.1.5 backend is built from Society commit
`ad74be6a8f45f78af1b550c2f66f34566e9cf63d`. Its attested matching frontend
bytes were checked against the existing live frontend. Fleet's protected
release workflow verified the active link, backend identity and configuration,
public API boundaries, and direct-origin restriction.

Microsoft owner sign-in was verified in a real browser after the application
passed the original transaction nonce to the Microsoft code exchange. Society
continues to verify the signed owner token and nonce. A private development
release manifest validated from the live backend; its APK was retrieved and
matched the manifest size and SHA-256. This verifies the backend artifact path,
not the password-authenticated browser journey or an Android installation.
Password login, browser download, session lifecycle and physical-phone
acceptance still need positive checks.

The separate legacy operator production-release card reported its release
record unavailable. Its production release connection was absent from both
the original and replacement backends. Do not substitute an unverified build;
the private development download is a distinct channel. The owner history
view also reported history unavailable during the sign-in check; that is not
proof of its cause or of a data breach.

See the [current source map](current-source-map.md) for source boundaries and
the [vNext foundation](society-vnext-foundation.md) for the companion contract.

Later on 2026-11-13, the owner sign-in was aligned with the journal login and
the owner workspace was aligned with the companion theme. Fleet deployed the
v1.1.7 backend from Society commit
`205df9e437c2a814e231195981426e1a7ec908ed` after verifying its matching live
frontend and protected backend checks. A real Microsoft owner login and the
updated workspace were verified after deployment. The owner reported that both
password and Microsoft login work; browser APK delivery and physical-device
acceptance remain separate checks.
