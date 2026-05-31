@AGENTS.md

# Chinese Tutor

A mobile-first Next.js PWA that turns a shared Google Doc of Chinese lesson notes into a spaced-repetition study app.

## What It Does

A Chinese teacher writes dated lesson notes into a Google Doc (hanzi, pinyin, translation, context sentences).
The doc is set to "Anyone with the link can view" so the server can fetch it without authentication.
The doc is updated after every lesson session.
This app:
1. Fetches and parses that doc via Gemini AI (`/api/parse`)
2. Presents AI-parsed vocab for human review/editing before it enters the study bank
3. Lets the user study approved vocab via SM-2 spaced repetition flashcards

## Tech Stack

| Layer     | Choice                    |
|-----------|---------------------------|
| Framework | Next.js 16 (App Router)   |
| AI        | Claude Haiku 4.5 (Anthropic) |
| Database  | Supabase (Postgres + RLS) |
| Auth      | Supabase Auth (planned)   |
| Styling   | Tailwind CSS              |
| Icons     | lucide-react              |
| Hosting   | Vercel (planned)          |

## Data Storage Modes

- **Local mode** (default): all state in localStorage. Used during development or when Supabase env vars are not set.
- **Supabase mode**: lessons and vocab in Postgres; study progress per-user via RLS. Used in production so data persists across devices and browser clears.

## Key Files

- `src/app/page.tsx` — entire frontend (tabs: Lessons / Flashcards / Practice / Stats / Review)
- `src/app/api/parse/route.ts` — fetches Google Doc → Claude Haiku 4.5 → returns pending vocab for review
- `src/app/api/sync/route.ts` — legacy regex-based parser (superseded by /api/parse, to be removed in M1)
- `src/lib/srs.ts` — SM-2 spaced repetition algorithm
- `src/lib/pending.ts` — localStorage queue for AI-parsed vocab awaiting user approval
- `src/lib/supabase.ts` — Supabase browser client (anon key)
- `src/lib/supabaseAdmin.ts` — Supabase server client (service role, never import in client components)
- `supabase/schema.sql` — full DB schema with RLS policies

## Conventions

- Each file must have a one-line comment at the top describing its purpose
- No speculative abstractions — solve the current milestone, not hypothetical future ones
- `supabaseAdmin` is server-only — never import it in client components or `'use client'` files
- Shared types between client and server live in `src/lib/types.ts`
- One feature branch per milestone; only merge to main when the milestone works end-to-end

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
NEXT_PUBLIC_GOOGLE_DOC_SYNC_URL=   # optional, overrides the hardcoded Google Doc URL
```
