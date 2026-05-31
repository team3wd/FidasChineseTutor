-- Migration 002: doc_snapshots table for raw Google Doc caching
-- Stores the last-fetched doc text so /api/parse can skip Anthropic when nothing changed.

CREATE TABLE IF NOT EXISTS public.doc_snapshots (
  id          SERIAL PRIMARY KEY,
  content     TEXT    NOT NULL,
  content_hash TEXT   NOT NULL,
  fetched_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Only service_role writes; anon can read the hash for client-side checks if needed.
ALTER TABLE public.doc_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to doc_snapshots"
  ON public.doc_snapshots FOR ALL
  TO service_role
  USING (true);
