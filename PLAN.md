# Implementation Plan

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

### M2 — Supabase Sync for Study Progress
Goal: SRS progress survives clearing localStorage; works across devices.

- [x] Add Supabase Auth (magic link email — simplest, no OAuth app setup needed)
- [x] On login: load `study_progress` from Supabase instead of localStorage
- [x] On card review: upsert `study_progress` row in Supabase
- [ ] ~~Offline fallback: write to localStorage, sync on reconnect~~ — DEFERRED: localStorage is written first and sync happens on login; explicit `online` event listener not implemented (low impact for single-user use case)
- [x] Show logged-in user in UI with logout option

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

---

### M5 — Polish & Deploy
Goal: shareable, stable, hosted.

- [ ] Deploy to Vercel with env vars configured
- [ ] Test PWA install-to-homescreen on iOS and Android
- [ ] Responsive design audit (phone-first)
- [ ] Error boundaries and loading states throughout UI
- [ ] Basic smoke test (Playwright or similar)

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
