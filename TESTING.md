# Testing

## Philosophy

Tests make vibe coding safe. Without them, a change to the SM-2 algorithm silently breaks scheduling; a refactor to the review flow breaks approval. With them, you move fast with confidence. 100% coverage on new code is the goal — AI makes this cheap.

## Two Layers

| Layer | Tool | What it covers | Run command |
|-------|------|----------------|-------------|
| Unit | Vitest | Pure logic: `src/lib/*.ts`, API route handlers | `npx vitest run` |
| E2E | Playwright | Browser flows: every tab, every user interaction | `npx playwright test` |

**Rule of thumb:** if the code has no browser dependency (pure function, server handler), use Vitest. If it requires a rendered page or user interaction, use Playwright.

## Running Tests

```bash
# Unit tests (fast, no browser)
npx vitest run

# Unit tests in watch mode during development
npx vitest

# E2E tests (requires dev server — Playwright starts it automatically)
npx playwright test

# E2E tests with browser UI visible
npx playwright test --headed

# Run a single E2E test file
npx playwright test tests/review.spec.ts
```

## File Layout

```
tests/                    ← all tests (Vitest unit + Playwright E2E)
  srs.test.ts             ← SM-2 algorithm — all 10 branches (Vitest)
  pending.test.ts         ← localStorage queue utilities (Vitest)
  navigation.spec.ts      ← tab switching (Playwright) ✅
  flashcards.spec.ts      ← card flip, grade buttons ✅
  review.spec.ts          ← inspect/approve/edit/approve-all/empty ✅
  parse.spec.ts           ← SSE parse flow (mocked API) ✅
  practice.spec.ts        ← tone game, multiple choice, pinyin fill-in ❌ TODO
  stats.spec.ts           ← stats display, cluster feature ❌ TODO
```

## Conventions

### Playwright (E2E)

- Seed localStorage via `page.addInitScript()` — never click through the UI to set up state
- Use `getByRole()` as the primary locator (mirrors how screen readers see the page)
- Use `getByText(/regex/)` when a count or dynamic value is in the text
- Use `.nth(n)` to disambiguate when multiple elements match the same locator
- Mock API calls with `page.route('**/api/...')` — never hit real Claude or Supabase in tests
- One `test.describe` block per feature area; one `test()` per scenario

### Vitest (unit)

- No browser globals — these run in Node, not a browser
- No mocking of `localStorage` needed for `srs.ts` (pure function, no side effects)
- For `pending.ts`: mock `localStorage` with `vi.stubGlobal('localStorage', ...)`
- For route handlers: mock `fetch` with `vi.stubGlobal('fetch', ...)` and the Anthropic SDK with `vi.mock()`

## What to Test

When writing new code, test:

- **New functions** — one test per branch (if/else, switch, early return)
- **Bug fixes** — write a regression test that reproduces the bug before fixing it
- **Error handling** — write a test that triggers the error condition
- **Edge cases** — null/undefined input, empty arrays, boundary values

When NOT to write a test:

- Pure CSS changes with no JS behavior
- Third-party library internals
- Trivial one-liners with no branching

## Coverage Targets

| Area | Status | Notes |
|------|--------|-------|
| `src/lib/srs.ts` | ❌ TODO | All 10 branches of `calculateSRS()` |
| `src/lib/pending.ts` | ❌ TODO | loadPending, savePending, clearPendingLesson, totalPendingCount |
| `src/app/api/parse/route.ts` | ❌ TODO | Missing env var, fetch failure, cache hit |
| Navigation | ✅ | 5 tests |
| Flashcards | ✅ | Flip + grade buttons |
| Review flow | ✅ | Full coverage including empty states |
| Parse flow | ✅ | SSE + redirect (mocked) |
| Practice tab | ❌ TODO | Three games × correct/incorrect paths |
| Stats tab | ❌ TODO | Pending cluster feature build |
