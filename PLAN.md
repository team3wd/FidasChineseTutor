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

- [ ] Add Supabase Auth (magic link email — simplest, no OAuth app setup needed)
- [ ] On login: load `study_progress` from Supabase instead of localStorage
- [ ] On card review: upsert `study_progress` row in Supabase
- [ ] Offline fallback: write to localStorage, sync on reconnect
- [ ] Show logged-in user in UI with logout option

---

### M3 — Practice Tab
Goal: active recall beyond flashcards.

- [ ] Define and agree on practice modes before building (e.g. hanzi→translation, translation→hanzi, fill-in-pinyin)
- [ ] Implement chosen mode(s)
- [ ] Wire practice results into SRS (`calculateSRS`) same as flashcards

---

### M4 — Stats Tab
Goal: meaningful study metrics.

- [ ] Daily/weekly cards reviewed
- [ ] Mastery breakdown (NEW / LEARNING / REVIEW / MASTERED counts)
- [ ] Study streak (consecutive days with at least one review)
- [ ] Decide: compute client-side from progress data, or add a Postgres view

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
| Gemini API rate limit hits | Any occurrence in normal use | Evaluate switching parser to Claude API (Anthropic) |
| Gemini API rate limit hits | Frequent / blocking usage | Switch to Claude API |

---

## Decisions Log

| Date    | Decision | Reason |
|---------|----------|--------|
| 2026-05 | Use Gemini for parsing instead of regex | Lesson notes are inconsistently formatted; regex was too brittle |
| 2026-05 | Human review step before vocab enters study bank | AI makes mistakes; user needs to catch low-confidence items |
| 2026-05 | localStorage as primary store for now | Simpler to ship M0; Supabase progress sync is M2 |
| 2026-05 | Magic link auth (not Google OAuth) for M2 | No OAuth app setup required; fits a single-user or small-group app |
| 2026-05 | Google Doc set to "Anyone with link can view" | Simplest access method; content is non-sensitive vocab notes |
| 2026-05 | Keep Gemini for now, revisit if rate limits hit | Gemini free tier sufficient for current usage; Claude API is an option if needed |
