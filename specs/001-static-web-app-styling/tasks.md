# Tasks: Static Web Application Styling

**Input**: Design documents from `/specs/001-static-web-app-styling/`

**Prerequisites**: plan.md (required), spec.md (required for user stories)

**Tests**: Lighthouse contrast audits, manual responsive testing, keyboard-only navigation tests.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel
- **[Story]**: User story tag (US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `app/` at repository root

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Design token definition and CSS reset

- [x] T001 Verify `app/styles.css` exists with CSS custom property reset and base box-sizing
- [x] T002 [P] Verify `app/index.html` and `app/agent.html` link to `app/styles.css`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core design tokens and base typography MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Define color custom properties in `app/styles.css` (`--background-dark`, `--text-primary`, `--neon-green`, `--neon-blue`, `--neon-pink`, `--neon-orange`)
- [x] T004 [P] Define spacing custom properties in `app/styles.css` (`--spacing-unit`, `--section-padding`, `--gap-sm`, `--gap-md`, `--gap-lg`)
- [x] T005 [P] Define typography custom properties in `app/styles.css` (`--font-stack-mono`, `--font-size-body`, `--font-size-heading`, `--font-weight-medium`)
- [x] T006 Implement CSS reset in `app/styles.css` (normalize margins, list styles, focus outlines)
- [x] T007 Implement base body styles in `app/styles.css` (background, color, font-family, line-height)

**Checkpoint**: Foundation ready - all tokens defined, base styles applied to HTML pages

---

## Phase 3: User Story 1 - Terminal-Inspired Visual Experience (Priority: P1) 🎯 MVP

**Goal**: Users see a cyberpunk terminal interface with dark backgrounds, neon accents, and monospace typography

**Independent Test**: Load `app/index.html`, visually inspect backgrounds, neon accents, and monospace text

### Tests for User Story 1

- [ ] T008 [P] [US1] Lighthouse audit: no contrast errors on primary text/background combinations
- [ ] T009 [P] [US1] DevTools inspection: all interactive elements use neon accent colors from tokens
- [ ] T010 [P] [US1] DevTools inspection: body font-family resolves to a monospace face

### Implementation for User Story 1

- [x] T011 [US1] Style the login screen in `app/styles.css` (terminal frame, prompt styling, passcode input)
- [x] T012 [US1] Apply dark background (`--background-dark`) to `body` and main containers in `app/styles.css`
- [x] T013 [P] [US1] Style tab bar with neon accent borders and active-state differentiation in `app/styles.css`
- [x] T014 [P] [US1] Style chat messages with sender-specific neon colors in `app/styles.css`
- [x] T015 [US1] Apply monospace font stack to all text elements via `app/styles.css`
- [x] T016 [US1] Add terminal cursor blink animation for input prompt in `app/styles.css` (respect `prefers-reduced-motion`)

**Checkpoint**: User Story 1 is fully functional and independently testable

---

## Phase 4: User Story 2 - Responsive Design Adaptation (Priority: P2)

**Goal**: Layout adapts gracefully across mobile, tablet, and desktop

**Independent Test**: Resize browser across breakpoints; verify no overflow, appropriate stacking, and readable spacing

### Tests for User Story 2

- [x] T017 [P] [US2] DevTools responsive mode: mobile (< 640px) shows stacked layout
- [x] T018 [P] [US2] DevTools responsive mode: tablet (640px–1024px) uses adjusted columns
- [x] T019 [P] [US2] DevTools responsive mode: desktop (> 1024px) shows multi-column layout

### Implementation for User Story 2

- [x] T020 [US2] Implement mobile-first base layout in `app/styles.css` (single column, full width)
- [x] T021 [US2] Implement tablet breakpoint `@media (min-width: 640px)` in `app/styles.css`
- [x] T022 [US2] Implement desktop breakpoint `@media (min-width: 1024px)` in `app/styles.css`
- [x] T023 [US2] Add wide-screen breakpoint `@media (min-width: 2560px)` in `app/styles.css` (max-width container)
- [x] T024 [US2] Ensure tab bar wraps or collapses appropriately on narrow viewports in `app/styles.css`
- [x] T025 [US2] Adjust chat panel height and input positioning for mobile in `app/styles.css`

**Checkpoint**: User Stories 1 AND 2 both work independently

---

## Phase 5: User Story 3 - Interactive Element Feedback (Priority: P2)

**Goal**: Users receive clear visual feedback on hover, focus, active, and disabled states

**Independent Test**: Interact with buttons, tabs, inputs; observe state transitions within 100ms

### Tests for User Story 3

- [ ] T026 [P] [US3] Manual test: button hover shows brightness/glow change within 100ms
- [ ] T027 [P] [US3] Manual test: input focus shows 2px neon outline with 2px offset
- [ ] T028 [P] [US3] Manual test: active tab changes to neon background with dark text
- [ ] T029 [P] [US3] Manual test: invalid form submission shows red border and error message

### Implementation for User Story 3

- [x] T030 [US3] Define interactive state custom properties in `app/styles.css` (`--hover-brightness`, `--focus-outline-color`)
- [x] T031 [US3] Implement hover states for buttons and tabs in `app/styles.css`
- [x] T032 [US3] Implement focus states for inputs and buttons in `app/styles.css`
- [x] T033 [US3] Implement active/disabled states for interactive elements in `app/styles.css`
- [x] T034 [US3] Add CSS transitions (150ms–300ms) for state changes in `app/styles.css`
- [x] T035 [US3] Style error state for invalid form inputs in `app/styles.css`

**Checkpoint**: User Story 3 is independently functional

---

## Phase 6: User Story 4 - Accessible Interface Design (Priority: P3)

**Goal**: Interface meets WCAG AA and supports keyboard/assistive users

**Independent Test**: Run Lighthouse accessibility audit; navigate with keyboard only; test with screen reader

### Tests for User Story 4

- [ ] T036 [P] [US4] Lighthouse accessibility score >= 90
- [ ] T037 [P] [US4] Keyboard-only navigation test: all interactive elements reachable and activatable
- [ ] T038 [P] [US4] Screen reader test: semantic headings and labels announced correctly
- [ ] T039 [P] [US4] Color contrast analyzer: all text meets WCAG AA (4.5:1)

### Implementation for User Story 4

- [x] T040 [US4] Add `:focus-visible` styles for keyboard users in `app/styles.css`
- [x] T041 [US4] Ensure button/link text has sufficient contrast against all backgrounds in `app/styles.css`
- [x] T042 [US4] Add `prefers-reduced-motion` media query to disable non-essential animations in `app/styles.css`
- [x] T043 [US4] Add `aria-label` and semantic heading structure to `app/index.html` and `app/agent.html`
- [x] T044 [US4] Ensure focus order is logical in tab panels via DOM order in `app/index.html`

**Checkpoint**: All user stories should now be independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T045 [P] Documentation updates in `docs/static-web-app-styling.md`
- [x] T046 [P] Refactor `app/styles.css` to remove any accidental `!important` declarations
- [x] T047 [P] Audit and reduce CSS specificity where possible
- [x] T048 [P] Add print styles or `display: none` for non-essential decorative elements in `app/styles.css`
- [x] T049 [P] Verify no inline styles exist in HTML; all styling is in `app/styles.css`
- [x] T050 Run quickstart validation: visual inspection on mobile, tablet, desktop

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup; BLOCKS all user stories
- **User Stories (Phase 3–6)**: All depend on Foundational phase; can proceed sequentially or in parallel if staffed
- **Polish (Phase 7)**: Depends on all desired user stories

### User Story Dependencies

- **US1 (P1)**: No story dependencies; can start after Phase 2
- **US2 (P2)**: Can start after Phase 2; responsive layout builds on base styles
- **US3 (P2)**: Can start after Phase 2; state styles reference base interactive tokens
- **US4 (P3)**: Can run in parallel with US2/US3; accessibility is cross-cutting

### Within Each User Story

- Tokens before component styles
- Base layout before breakpoint adjustments
- Core states before transitions

### Parallel Opportunities

- Color, spacing, and typography token definitions can be written in parallel
- US2 breakpoint work and US3 state styles can proceed in parallel
- US4 markup changes (ARIA) can proceed in parallel with CSS work

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
