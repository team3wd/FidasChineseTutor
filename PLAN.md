# Implementation Plan

> **Working convention:** At the start of every session, read `## Current Focus` to orient.
> At the end of every session, update `## Current Focus` with what changed.

---

## Current Focus
Last updated: 2026-06-01

Working on: Testing strategy implementation (see M5 testing tasks below)

- [x] T1 — Install Vitest + write `tests/srs.test.ts` (16 tests, all passing)
- [x] T2 — Write `tests/practice.spec.ts` (20 tests, all passing)
- [ ] T3 — Write `tests/pending.test.ts` ← **next**
- [ ] T4 — Route handler tests for `/api/parse`
- [ ] CI — GitHub Actions workflow (blocked by T3 + T4)

Blocked on: nothing
Next session should start with: T3 — `tests/pending.test.ts`

Key learnings from T2:
- `Math.random = () => 0` in `addInitScript` prevents React hydration (Next.js Turbopack uses it internally). Do NOT mock Math.random in browser tests.
- Instead, use uniform fixture data so the correct answer is the same regardless of which word is randomly picked.
- For MC wrong-answer tests: read the correct translation via `page.evaluate()` DOM traversal, then click any other visible option.

---

## Milestones

### M0 — Foundation ✅ done
- Next.js 16 project scaffold
- Supabase schema: `lessons`, `vocabulary`, `study_progress` tables with RLS
- SM-2 spaced repetition algorithm (`src/lib/srs.ts`)
- Gemini-powered lesson parser (`/api/parse`) with rate-limit handling
- Pending vocab queue in localStorage (`src/lib/pending.ts`)
- Single-page UI with 5 tabs (Lessons, Flashcards, Practice, Stats, Review)
- PWA manifest and icons

---

### M1 — Cleanup & Stabilise ✅ done
Goal: make the codebase honest about what it is before adding anything new.

- [x] Delete `/api/sync` — legacy regex parser, fully superseded by `/api/parse` + Gemini
- [x] Create `src/lib/types.ts` — single source of truth for shared types (`VocabItem`, `Lesson`, `LocalStudyProgress`, etc.)
- [x] Split `page.tsx` into focused tab components (`LessonsTab`, `FlashcardsTab`, `PracticeTab`, `StatsTab`, `ReviewTab`) under `src/components/tabs/`
- [x] Add `.env.local.example` so onboarding is self-documenting
- [x] localStorage keys documented in `src/app/page.tsx` header comment

---

### M2 — Supabase Sync for Study Progress ✅ done
Goal: SRS progress survives clearing localStorage; works across devices.

- [x] Add Supabase Auth (magic link email — simplest, no OAuth app setup needed)
- [x] On login: load `study_progress` from Supabase instead of localStorage
- [x] On card review: upsert `study_progress` row in Supabase
- [x] Show logged-in user in UI with logout option
- [ ] ~~Offline fallback: write to localStorage, sync on reconnect~~ — DEFERRED: localStorage is written first and sync happens on login; explicit `online` event listener not implemented (low impact for single-user use case)

---

### M3 — Practice Tab ✅ done
Goal: active recall beyond flashcards.

- [x] Define and agree on practice modes — chosen: fill-in-pinyin (see hanzi, type the pinyin)
- [x] Implement chosen mode (Game 3 in PracticeTab — accepts tone marks or tone numbers, spaces ignored)
- [x] Wire practice results into SRS (`calculateSRS`) same as flashcards (correct = grade 4, wrong = grade 1)

---

### M4 — Stats Tab ✅ done
Goal: meaningful study metrics.

- [x] Daily/weekly cards reviewed (tracked in `ch_daily_reviews` localStorage, shown as Reviews Today + This Week tiles)
- [x] Mastery breakdown (NEW / LEARNING / REVIEW / MASTERED counts) — global mastery funnel with stacked bar
- [x] Study streak (consecutive days with at least one review)
- [x] Decided: compute client-side from progress data (no Postgres view needed)
- [x] Per-topic mastery breakdown — cluster API extended to return full `words[]` per topic; StatsTab shows mastery bar + legend per cluster
- Deferred: **hash-based staleness check for `ch_cluster_cache`** — v1 uses `vocab_count`; a hash of the hanzi array would catch edits that don't change the count. Not worth the complexity yet.
- Deferred: **`readiness_pct` staleness in cached scenarios** — cached percentages don't update when SRS intervals improve between cache writes. Acceptable for v1.

---

### M5 — Polish, Test & Deploy
Goal: shareable, stable, hosted, tested.

**Testing** (in progress — see Current Focus above):
- [x] T1 — Vitest setup + `tests/srs.test.ts` (16 unit tests, all branches of `calculateSRS()`)
- [x] T2 — `tests/practice.spec.ts` — tone game, multiple choice, pinyin fill-in (E2E, 20 tests)
- [ ] T3 — `tests/pending.test.ts` — `loadPending`, `clearPendingLesson`, `totalPendingCount` (unit)
- [ ] T4 — Route handler tests for `/api/parse` — missing env var, fetch failure, cache hit (unit)
- [ ] T5 — `tests/stats.spec.ts` + `tests/stats-cluster.spec.ts` — defer until cluster feature build
- [ ] CI — GitHub Actions: `npm test` + `npx playwright test` on every push (blocked by T3 + T4)

**Deploy:**
- [ ] Deploy to Vercel with env vars configured
- [ ] Test PWA install-to-homescreen on iOS and Android
- [ ] Responsive design audit (phone-first)
- [ ] Error boundaries and loading states throughout UI

---

## Evaluation Metrics

| Metric | Threshold | Action |
|--------|-----------|--------|
| Claude Haiku parse quality | Consistently missing or wrong vocab items | Upgrade parser to Claude Sonnet 4.6 |
| Claude API rate limit hits | Frequent / blocking usage | Review usage patterns; consider batching or caching |

---

## Decisions Log

| Date    | Decision | Reason |
|---------|----------|--------|
| 2026-05 | Use Gemini for parsing instead of regex | Lesson notes are inconsistently formatted; regex was too brittle |
| 2026-05 | Human review step before vocab enters study bank | AI makes mistakes; user needs to catch low-confidence items |
| 2026-05 | localStorage as primary store for now | Simpler to ship M0; Supabase progress sync is M2 |
| 2026-05 | Magic link auth (not Google OAuth) for M2 | No OAuth app setup required; fits a single-user or small-group app |
| 2026-05 | Google Doc set to "Anyone with link can view" | Simplest access method; content is non-sensitive vocab notes |
| 2026-05 | Switch parser from Gemini to Claude Haiku 4.5 | Gemini free tier quota was fully exhausted (limit: 0); Claude Haiku is fast, cheap, and handles structured extraction well |
| 2026-06 | Two-layer testing strategy: Vitest (unit) + Playwright (E2E) | SM-2 algorithm needs fast unit tests; browser flows need E2E. See TESTING.md. |
| 2026-06 | Flat `tests/` directory for all tests | *.test.ts = Vitest, *.spec.ts = Playwright — extension is the differentiator |
| 2026-06 | Consolidate TODOS.md into PLAN.md | Single source of truth; less overhead for a solo project |
| 2026-06 | Do not mock Math.random in Playwright addInitScript | Next.js Turbopack uses Math.random internally; mocking it to a constant prevents React hydration |
