# Feature Specification: DNS-Bound OSINT HTTPS Probes

**Feature Branch**: `fix/issue-32-osint-rebinding`
**Created**: 2026-08-15
**Status**: Active
**Input**: Society issue #32

## Problem

A public hostname was DNS-validated and then passed to hostname-based `fetch()`. A rebinding answer could change between validation and connection.

## Functional Requirements

1. The probe must resolve each HTTPS target once and reject missing, malformed, private, local, reserved, or mixed answer sets.
2. The HTTPS client must connect only through the vetted address set. It must retain the requested hostname for the `Host` header, SNI, and certificate validation.
3. The probe must reject a private peer and any peer address that is not in the vetted set.
4. Each manual redirect is a new target: validate its URL, resolve it, and bind its next connection separately.
5. Probes remain HTTPS-only, credential-free, redirect-bounded, timeout-bounded, and response-size-bounded.

## Success Criteria

- A public-at-validation/private-at-connect rebind cannot receive a request.
- A mismatched actual peer fails closed.
- Existing private-address and redirect safety behavior remains intact.
