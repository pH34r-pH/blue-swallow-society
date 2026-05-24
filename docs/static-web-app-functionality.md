# Static Web App Functionality

## Overview
The Blue Swallow Society static web application provides a cyberpunk-themed terminal interface for interacting with the society's network console. The application implements authentication, tabbed navigation, and various interactive components.

## Core Features

### Authentication System
- Terminal-style login interface with passcode validation
- Simulated backend validation (fallback to hardcoded passcode "blue-swallow" for development)
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
- Simulated backend communication via `/api/agent` endpoint

### UI Components
- Custom terminal-styled login screen
- Cyberpunk-inspired color scheme (neon accents on dark background)
- Responsive layout with container-based design
- Interactive buttons with hover/active states
- Error messaging system for authentication feedback

### API Integration
The frontend communicates with the following backend endpoints:
- `/api/validate-passcode` (POST) - Passcode validation
- `/api/agent?prompt={message}` (GET) - Agent chat responses
- `/api/echo?msg={message}` (GET) - Echo lab functionality (via proxy)
- `/api/profile` (GET) - Protected profile endpoint (requires auth)

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

## Current Limitations
- Monitoring and Experiments tabs are placeholders
- Agent responses are simulated (would call `/api/agent` in production)
- No persistent data storage (all state is session-based)
- Accessibility audits (Lighthouse, keyboard-only) are pending manual validation

## Security Considerations
- Authentication via Azure AD Easy Auth (in production)
- Passcode validation should be backed by secure VM service
- API calls made to same-origin endpoints (via Static Web App routing)
- No sensitive data stored in client-side storage
- Input sanitization strips HTML tags and enforces max length on passcode field
- Chat messages use safe DOM construction (textContent) to prevent XSS
- Keyboard navigation supports arrow keys, Home, and End for tab cycling
- Error announcements use aria-live="assertive" for screen reader support
