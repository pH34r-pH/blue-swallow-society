# Tasks: Static Web Application Functionality

**Input**: Design documents from `/specs/000-static-web-app-functionality/`

**Prerequisites**: plan.md (required), spec.md (required for user stories)

**Tests**: Manual browser testing and Azure SWA preview validation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel
- **[Story]**: User story tag (US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `app/`, `api/` at repository root

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Verify `app/index.html` exists with semantic structure and login/main interface shells
- [x] T002 [P] Verify `app/agent.html` exists with agent lab markup
- [x] T003 [P] Verify `app/staticwebapp.config.json` includes security headers (CSP, X-Frame-Options) and route fallbacks

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Implement `app/main.js` module loader and shared utilities (DOM helpers, event delegation)
- [x] T005 Implement session state manager in `app/main.js` (`isAuthenticated`, `chatHistory`, `currentTab`)
- [x] T006 [P] Verify `api/validate-passcode/function.json` and `api/validate-passcode/index.js` exist and compare against passcode "blue-swallow"
- [x] T007 [P] Verify `api/agent/function.json` and `api/agent/index.js` exist and implement placeholder response logic
- [x] T008 [P] Verify `api/profile/function.json` and `api/profile/index.js` exist and return decoded client principal
- [x] T009 Verify `app/styles.css` is linked in all HTML pages (`app/index.html`, `app/agent.html`)

**Checkpoint**: Foundation ready - static pages load, Functions stubs respond, session module exists

---

## Phase 3: User Story 1 - Secure Network Access (Priority: P1) 🎯 MVP

**Goal**: Users can authenticate with the passcode and manage their session securely

**Independent Test**: Load `app/index.html`, enter "blue-swallow", verify main UI appears; enter wrong passcode, verify error; click logout, verify login screen returns and chatHistory is cleared

### Tests for User Story 1

- [ ] T010 [P] [US1] Manual test: valid passcode reveals main interface in < 3s
- [ ] T011 [P] [US1] Manual test: invalid passcode shows "ACCESS DENIED - INVALID CREDENTIALS"
- [ ] T012 [P] [US1] Manual test: logout clears `chatHistory` and resets `isAuthenticated`

### Implementation for User Story 1

- [x] T013 [US1] Implement terminal login UI in `app/index.html` with password input and submit button
- [x] T014 [P] [US1] Verify passcode validation logic in `app/main.js` calls `POST /api/validate-passcode` and falls back to client-side validation
- [x] T015 [P] [US1] Verify `api/validate-passcode/index.js` compares against hardcoded passcode "blue-swallow" and returns JSON `{ok: boolean}`
- [x] T016 [US1] Implement logout handler in `app/main.js` that clears session state and returns to login screen
- [x] T017 [US1] Add input sanitization for passcode field (max length, strip HTML tags) in `app/main.js`
- [x] T018 [US1] Add error state styling hook in `app/main.js` for failed authentication

**Checkpoint**: User Story 1 is fully functional and independently testable

---

## Phase 4: User Story 2 - Network Console Navigation (Priority: P2)

**Goal**: Authenticated users can navigate between Landing, Agentic, Monitoring, and Experiments tabs

**Independent Test**: Authenticate, click each tab, verify correct section visibility while auth state persists

### Tests for User Story 2

- [ ] T019 [P] [US2] Manual test: all four tabs display correct content sections
- [ ] T020 [P] [US2] Manual test: tab switching does not require re-authentication

### Implementation for User Story 2

- [x] T021 [US2] Implement tab container markup in `app/index.html` with four tab buttons and corresponding content panels
- [x] T022 [US2] Implement tab-switching controller in `app/main.js` with aria-roles and keyboard support (arrow keys)
- [x] T023 [US2] Implement "LANDING" panel content (network manifesto, status display) in `app/index.html`
- [x] T024 [US2] Implement "AGENTIC" panel placeholder (loads `app/agent.js` chat component) in `app/index.html`
- [x] T025 [US2] Implement "MONITORING" panel placeholder in `app/index.html`
- [x] T026 [US2] Implement "EXPERIMENTS" panel placeholder in `app/index.html`
- [x] T027 [US2] Add active-tab state management and CSS class toggling in `app/main.js`

**Checkpoint**: User Stories 1 AND 2 both work independently

---

## Phase 5: User Story 3 - Agentic Communication (Priority: P2)

**Goal**: Users can send and receive messages in a real-time chat interface

**Independent Test**: Navigate to AGENTIC tab, send messages, verify they appear with timestamps; verify auto-scroll

### Tests for User Story 3

- [ ] T028 [P] [US3] Manual test: sent message appears as user message with timestamp
- [ ] T029 [P] [US3] Manual test: agent response appears after brief delay
- [ ] T030 [P] [US3] Manual test: multiple messages persist and auto-scroll

### Implementation for User Story 3

- [x] T031 [P] [US3] Implement chat message model in `app/agent.js` (sender, text, timestamp)
- [x] T032 [P] [US3] Implement chat input form in `app/agent.html` and `app/index.html` AGENTIC panel
- [x] T033 [US3] Implement message send handler in `app/agent.js` calling `POST /api/agent`
- [x] T034 [US3] Implement message rendering and DOM updates in `app/agent.js`
- [x] T035 [US3] Implement chat history persistence in session state (`app/main.js` state manager)
- [x] T036 [US3] Implement auto-scroll to latest message in `app/agent.js`
- [x] T037 [US3] Sanitize chat input to prevent XSS before DOM insertion in `app/agent.js`
- [x] T038 [US3] Implement `api/agent/index.js` placeholder response logic with prompt echo

**Checkpoint**: User Story 3 is independently functional

---

## Phase 6: User Story 4 - Responsive Network Access (Priority: P3)

**Goal**: Interface adapts gracefully across mobile, tablet, and desktop viewports

**Independent Test**: Resize browser from 320px to 1920px, verify no clipping, touch targets >= 44px, readable fonts

### Tests for User Story 4

- [ ] T039 [P] [US4] Manual test: mobile (< 640px) layout stacks vertically with usable touch targets
- [ ] T040 [P] [US4] Manual test: tablet (640px–1024px) uses horizontal space effectively
- [ ] T041 [P] [US4] Manual test: desktop (> 1024px) layout uses wider content areas

### Implementation for User Story 4

- [x] T042 [P] [US4] Verify responsive meta viewport tag exists in `app/index.html` and `app/agent.html`
- [x] T043 [US4] Verify tab panels collapse or stack gracefully on narrow viewports via existing CSS
- [x] T044 [US4] Ensure minimum 44px touch targets on buttons and inputs via `app/styles.css` (coordinate with spec 001)

**Checkpoint**: All user stories should now be independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T047 [P] Documentation updates in `docs/static-web-app-functionality.md`
- [x] T048 [P] Code cleanup: remove console.log statements from `app/main.js` and `app/agent.js`
- [ ] T049 [P] Performance: audit bundle size and eliminate unused JS
- [ ] T050 [P] Security hardening: verify CSP in `staticwebapp.config.json` blocks inline scripts and eval
- [ ] T051 [P] Accessibility pass: verify keyboard navigation and ARIA labels across all tabs
- [ ] T052 Run quickstart validation: authenticate, switch tabs, chat, logout end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup; BLOCKS all user stories
- **User Stories (Phase 3–6)**: All depend on Foundational phase; can proceed sequentially or in parallel if staffed
- **Polish (Phase 7)**: Depends on all desired user stories

### User Story Dependencies

- **US1 (P1)**: No story dependencies; can start after Phase 2
- **US2 (P2)**: Depends on US1 auth gate; can start immediately after US1
- **US3 (P2)**: Depends on US2 tab container being present; can start after US2
- **US4 (P3)**: Styling-dependent; can run in parallel with US2/US3 but validates last

### Within Each User Story

- UI markup before JS controllers
- JS state management before API wiring
- Core implementation before edge-case handling

### Parallel Opportunities

- All HTML stub tasks in Phase 1 can run in parallel
- All Azure Function stubs in Phase 2 can run in parallel
- US2 markup and US3 markup can be written in parallel once Phase 2 is done
- Responsive CSS (US4) can be authored in parallel with functional JS (US2/US3)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
