# Implementation Plan: Static Web Application Functionality

**Branch**: `000-static-web-app-functionality` | **Date**: 2026-05-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/000-static-web-app-functionality/spec.md`

**Note**: This template is filled in by the `__SPECKIT_COMMAND_PLAN__` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Implement a cyberpunk-themed terminal interface web application for the Blue Swallow Society network console. The feature provides client-side authentication with a hardcoded passcode, tabbed navigation across four sections (Landing, Agentic, Monitoring, Experiments), a real-time chat interface with an AI agent, and responsive design for multi-device access. The frontend is a static Azure Web App backed by Azure Functions for API operations.

## Technical Context

**Language/Version**: HTML5, CSS3, ES6 (vanilla JavaScript), Node.js 18 (Azure Functions runtime)

**Primary Dependencies**: Azure Static Web Apps, Azure Functions v4, vanilla JS (no frontend framework)

**Storage**: Session-only (in-memory) for chat history and auth state; no persistent client storage required by this feature

**Testing**: Manual browser testing, Azure Static Web App preview environments

**Target Platform**: Modern web browsers (Chrome, Firefox, Safari, Edge) on desktop, tablet, and mobile

**Project Type**: web-service (static frontend + serverless backend)

**Performance Goals**: Authentication response < 3s, tab switch < 1s, chat response < 5s

**Constraints**: No PII collection; hardcoded passcode acceptable for dev only; CSP headers required; all user inputs sanitized; AAD auth routes exist in SWA config but are not used by the frontend login flow

**Scale/Scope**: Single-tenant society console; expected concurrent users < 10

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Notes |
|-----------|------------|-------|
| Security-First | PASS | Input sanitization, XSS prevention, and session clearing on logout are specified |
| Privacy/Anonymity | PASS | No PII collection; passcode-only auth with no user identity tracking |
| Defense in Depth | PASS | Frontend validation + backend validation; CSP to be enforced via `staticwebapp.config.json` |
| Secure Defaults | PASS | Session clears on logout; auth gate on all tabs |
| Continuous Monitoring | N/A at this phase | Security headers and API logging to be implemented |

## Project Structure

### Documentation (this feature)

```text
specs/000-static-web-app-functionality/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output (browser APIs, auth patterns)
├── data-model.md        # Phase 1 output (session state, message schema)
├── contracts/           # Phase 1 output (API request/response shapes)
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
app/
├── index.html           # Main application shell with tabbed interface
├── agent.html           # Standalone agent chat page
├── main.js              # Login logic, tab switching, session management
├── agent.js             # Chat interface, message rendering, API calls
├── styles.css           # Cyberpunk terminal styling (see spec 001)
└── staticwebapp.config.json  # Azure SWA routing and security headers

api/
├── validate-passcode/   # Azure Function: POST /api/validate-passcode
├── agent/               # Azure Function: POST /api/agent
├── osint/               # Azure Function: POST /api/osint
├── tzeentch/            # Azure Function: GET /api/tzeentch
├── wigle/               # Azure Function: GET /api/wigle
└── profile/             # Azure Function: GET /api/profile
```

**Structure Decision**: Single-project static web app with co-located Azure Functions. The `app/` directory is the frontend root; `api/` contains serverless backends. Cybermap `/api/cybermap/*` proxy routes target the VM gateway via `CYBERMAP_BACKEND_BASE_URL` and server-side `CYBERMAP_BACKEND_TOKEN` rather than the retired echo scaffold.

## Complexity Tracking

> No constitution violations or unjustified complexity detected. Feature stays within single frontend + Functions scope.
