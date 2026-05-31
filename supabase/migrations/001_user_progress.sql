-- Migration 001: user_progress table keyed by (user_id, hanzi)
-- Simpler than study_progress; no FK to vocabulary so it works with local vocab IDs.

CREATE TABLE IF NOT EXISTS public.user_progress (
  user_id       UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hanzi         TEXT    NOT NULL,
  interval      INTEGER NOT NULL DEFAULT 0,
  ease_factor   DOUBLE PRECISION NOT NULL DEFAULT 2.5,
  repetitions   INTEGER NOT NULL DEFAULT 0,
  next_review   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  status        TEXT    NOT NULL DEFAULT 'NEW',
  incorrect_count INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, hanzi)
);

ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own progress"
  ON public.user_progress FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_progress_user_id ON public.user_progress(user_id);
