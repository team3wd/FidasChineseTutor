# Playwright Learning Plan

Goal: add meaningful E2E test coverage to the Chinese Tutor app while learning how
Playwright works by observing the implementation step by step.

## Context

- App: Next.js 16 App Router, mobile-first PWA
- Storage: localStorage (local mode, default) + Supabase (production)
- AI: Claude Haiku 4.5 via `/api/parse` (SSE stream)
- UI: five tabs — Lessons, Flashcards, Practice, Stats, Review

## Testing Strategy (Three-Layer)

| Layer | Tool | What it covers |
|-------|------|----------------|
| Unit / pure logic | Vitest | SM-2 algorithm (`srs.ts`), pending queue (`pending.ts`), data-transform helpers |
| Component behaviour | React Testing Library + jsdom | Individual tab components in isolation |
| End-to-end flows | **Playwright** | Full user flows in a real browser |

This plan covers the **Playwright layer only**.

## How Playwright Works (Mental Model)

Playwright is a Node.js library that controls a real browser.
Three core objects to understand:

- `page` — the browser tab. Used for navigation and actions: `page.goto()`, `page.click()`, `page.fill()`
- `page.locator(selector)` — finds an element. Prefer role/text locators over CSS/XPath.
- `expect(locator).toBeVisible()` — assertion. Waits automatically (no manual sleep needed).
- `test('name', async ({ page }) => { ... })` — wraps one scenario, like `it()` in Jest.
- `test.use({ ... })` — applies config (e.g. mobile viewport) to a block of tests.

## Implementation Steps

### Step 1 — Install Playwright
Command: `npm init playwright@latest`
Generates:
- `playwright.config.ts` — global config
- `tests/` — test files (`.spec.ts`)
- Optional GitHub Actions workflow

### Step 2 — Configure for this app
Key config options to set in `playwright.config.ts`:
- `baseURL: 'http://localhost:3000'` — so tests use `page.goto('/')` not full URLs
- `webServer` block — tells Playwright to run `npm run dev` before tests and wait for the server
- `use.viewport` — set to mobile size (e.g. 390×844) since the app is mobile-first
- `projects` — which browsers to test (start with Chromium only)

### Step 3 — Write tests (ordered by complexity)

#### Test A: Tab navigation
File: `tests/navigation.spec.ts`

Teaches:
- `page.goto('/')`
- `page.getByRole('button', { name: '...' })` — preferred locator style
- `expect(locator).toBeVisible()`

What it covers: clicking each bottom-nav tab and confirming the right panel appears.

#### Test B: Flashcard flip
File: `tests/flashcards.spec.ts`

Teaches:
- Seeding `localStorage` before the test via `page.addInitScript()`
- Chained interactions: click "Flashcards" tab → card appears → click to flip → back side appears
- `toContainText()` assertion

What it covers: the study flow works when vocab exists in the bank.

#### Test C: Parse API mock (most important)
File: `tests/parse.spec.ts`

Teaches:
- `page.route('/api/parse', handler)` — intercepts the network request
- Returning a fake SSE stream so the test never calls real Claude API
- Asserting that the Review tab shows the mocked vocab items

What it covers: the parse → review pipeline works end-to-end without real API calls.
This is the pattern to reuse for any feature that touches `/api/parse`.

## What Playwright Does NOT Test Here

- `groupLinesByDate()` in `route.ts` — pure function, use Vitest
- SM-2 scheduling logic in `srs.ts` — pure function, use Vitest
- Supabase RLS policies — use Supabase's own test tooling or direct SQL

## Key Files (once implemented)

- `playwright.config.ts` — root config
- `tests/navigation.spec.ts` — tab switching
- `tests/flashcards.spec.ts` — flashcard flip with seeded localStorage
- `tests/parse.spec.ts` — parse flow with mocked API

## Running Tests

```bash
# run all tests (headless)
npx playwright test

# run with browser visible (good for learning/debugging)
npx playwright test --headed

# run a single file
npx playwright test tests/navigation.spec.ts

# open the interactive UI mode (best for stepping through tests)
npx playwright test --ui
```

## Progress

- [x] Step 1: Install Playwright
- [x] Step 2: Configure `playwright.config.ts`
- [x] Step 3A: Write navigation test
- [x] Step 3B: Write flashcard test with localStorage seeding
- [x] Step 3C: Write parse API mock test

## Lessons Learned During Implementation

- `toBeVisible()` does NOT detect CSS 3D transform hiding (flip cards). Use conditionally rendered elements instead.
- `getByText()` without `{ exact: true }` matches any element containing the string — causes strict mode violations when multiple elements match. Always use `exact: true` when the text could appear in multiple places.
- Route patterns need `**` prefix: `'**/api/parse'` not `'/api/parse'`, because Playwright matches against the full URL including host.
