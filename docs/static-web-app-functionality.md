# Static Web App Functionality

## Overview
The Blue Swallow Society static web application provides a cyberpunk-themed terminal interface for interacting with the society's network console. The application implements authentication, tabbed navigation, and various interactive components.

## Core Features

### Authentication System
- Terminal-style login interface with passcode validation
- Server-side passcode validation via `/api/validate-passcode`; no client fallback secret
- Session state management (`isAuthenticated` flag)
- Logout functionality that resets interface and chat history

### Tabbed Interface
Four main tabs accessible after authentication:
1. **Landing**: Network manifesto and status display
2. **Agentic**: Chat interface for interacting with the AI agent
3. **Monitoring**: System monitoring feed placeholder
4. **Experiments**: Experimental workbench placeholder

### Agentic Chat
- Real-time chat interface with user/agent message styling
- Timestamped messages
- Auto-scrolling to latest message
- Chat history persistence in session
- Server-mediated agent communication via `/api/agent`

### UI Components
- Custom terminal-styled login screen
- Cyberpunk-inspired color scheme (neon accents on dark background)
- Responsive layout with container-based design
- Interactive buttons with hover/active states
- Error messaging system for authentication feedback

### API Integration
The frontend communicates with the following backend endpoints:
- `/api/validate-passcode` (POST) - Passcode validation
- `/api/agent` (POST) - Agent chat responses
- `/api/profile` (GET) - Protected profile endpoint (requires auth)
- `/api/osint` and `/api/tzeentch` (POST/GET) - Operator-token protected analysis/dashboard endpoints
- `/api/cybermap/*` (GET) - Operator-token protected same-origin proxy to VM Cybermap v1 read endpoints via `CYBERMAP_BACKEND_BASE_URL` + server-side `CYBERMAP_BACKEND_TOKEN`.

## Technical Implementation

### State Management
- Authentication state (`isAuthenticated`)
- Chat history array (`chatHistory`)
- DOM element caching via helper functions (`$` and `$$`)

### Event Handling
- Click events for login, logout, tab switching, and message sending
- Keypress events for Enter key submission in inputs
- Dynamic class toggling for UI state changes

### Responsive Design
- Mobile-friendly layout using CSS flexbox and grid principles
- Touch-friendly button sizes (minimum 44px via padding)
- Readable typography at various screen sizes
- Wide-screen breakpoint at 2560px with max-width container
- `prefers-reduced-motion` media query disables non-essential animations


### Tzeentch Market Surface
- `/api/tzeentch` serves a public read-only dashboard payload for the Tzeentch tab.
- The surface is organized into swipeable sub-tabs: **Murmurs**, **Crypto**, **Polymarket**, and **Actionable Intel**.
- CoinGecko and Polymarket Gamma are consumed as public sources; no API keys, tokens, or account credentials are stored or embedded in the client.
- Any future live trading or bet-placement flow must use user-mediated sign-in / on-behalf-of authorization so the user authenticates directly with the target service.
- Crypto views present the top 10 assets by trading volume with last-24-hour and last-5-day chart slices derived from public price history.
- Polymarket shows new markets and recently resolved markets without requiring an account for browsing.
- Actionable Intel remains paper-only: proposed buys and sells must include rationale, evidence, and source links for review/iteration.
- The Mosaic & Murmurs operating doctrine defines the dual-mind model, paper treasury loop, sensorium roadmap, governance gates, and embodiment milestones in [`docs/mosaic-and-murmurs-operating-doctrine.md`](./mosaic-and-murmurs-operating-doctrine.md).
- The S0 sensorium proposal keeps current lawful read-only perception in S0: Jetson runtime, RaID episodic sight, global Greenfeed jack-in, and direct-observation packets for claim validation in [`docs/mosaic-and-murmurs-s0-sensorium-proposal.md`](./mosaic-and-murmurs-s0-sensorium-proposal.md).

## Current Limitations
- Monitoring and Experiments tabs are placeholders
- Agent responses are simulated (would call `/api/agent` in production)
- No persistent data storage (all state is session-based)
- Accessibility audits (Lighthouse, keyboard-only) are pending manual validation

## Security Considerations
- Authentication via Azure AD Easy Auth (in production)
- Passcode validation stays server-side; Cybermap VM routes require token-gated `/api/v1/*` access
- API calls made to same-origin endpoints (via Static Web App routing)
- No sensitive data stored in client-side storage
- Input sanitization strips HTML tags and enforces max length on passcode field
- Chat messages use safe DOM construction (textContent) to prevent XSS
- Keyboard navigation supports arrow keys, Home, and End for tab cycling
- Error announcements use aria-live="assertive" for screen reader support
