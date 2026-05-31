-- Supabase Database Schema for Chinese Study Mobile Web App
-- You can copy and execute this SQL script in the Supabase SQL Editor (https://supabase.com)

-- Enable UUID generation extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -------------------------------------------------------------
-- 1. LESSONS TABLE
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL UNIQUE,
    context_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for Lessons
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

-- Lessons Policies
CREATE POLICY "Allow public read access to lessons" 
    ON public.lessons FOR SELECT 
    USING (true);

CREATE POLICY "Allow service role full access to lessons" 
    ON public.lessons FOR ALL 
    TO service_role 
    USING (true);

-- -------------------------------------------------------------
-- 2. VOCABULARY TABLE
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vocabulary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id UUID REFERENCES public.lessons(id) ON DELETE CASCADE NOT NULL,
    hanzi VARCHAR(255) NOT NULL,
    pinyin VARCHAR(255) NOT NULL,
    translation TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    -- Ensure same hanzi is not duplicated under the same lesson date
    CONSTRAINT unique_hanzi_per_lesson UNIQUE (lesson_id, hanzi)
);

-- Enable RLS for Vocabulary
ALTER TABLE public.vocabulary ENABLE ROW LEVEL SECURITY;

-- Vocabulary Policies
CREATE POLICY "Allow public read access to vocabulary" 
    ON public.vocabulary FOR SELECT 
    USING (true);

CREATE POLICY "Allow service role full access to vocabulary" 
    ON public.vocabulary FOR ALL 
    TO service_role 
    USING (true);

-- -------------------------------------------------------------
-- 3. STUDY PROGRESS TABLE (Per-User SRS state)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.study_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- References auth.users(id) managed by Supabase Auth
    vocab_id UUID REFERENCES public.vocabulary(id) ON DELETE CASCADE NOT NULL,
    
    -- SM-2 SuperMemo Algorithm Parameters
    interval INTEGER DEFAULT 0 NOT NULL,         -- Days till next review (0 = review immediately)
    ease_factor DOUBLE PRECISION DEFAULT 2.5 NOT NULL, -- Ease multiplier for review intervals
    repetitions INTEGER DEFAULT 0 NOT NULL,      -- Number of consecutive correct reviews
    next_review TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    status VARCHAR(50) DEFAULT 'NEW' NOT NULL,   -- 'NEW', 'LEARNING', 'REVIEW', 'MASTERED'
    incorrect_count INTEGER DEFAULT 0 NOT NULL,  -- Lifetime count of incorrect answers
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Ensure one progress tracker per user per vocabulary item
    CONSTRAINT unique_user_vocab UNIQUE (user_id, vocab_id)
);

-- Enable RLS for Study Progress
ALTER TABLE public.study_progress ENABLE ROW LEVEL SECURITY;

-- Study Progress Policies
CREATE POLICY "Allow users to manage their own study progress" 
    ON public.study_progress FOR ALL 
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow service role full access to study progress" 
    ON public.study_progress FOR ALL 
    TO service_role 
    USING (true);

-- -------------------------------------------------------------
-- 4. INDEXES FOR PERFORMANCE
-- -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_vocabulary_lesson_id ON public.vocabulary(lesson_id);
CREATE INDEX IF NOT EXISTS idx_study_progress_user_id ON public.study_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_study_progress_next_review ON public.study_progress(next_review) WHERE status != 'MASTERED';
CREATE INDEX IF NOT EXISTS idx_study_progress_user_next_review ON public.study_progress(user_id, next_review);

-- -------------------------------------------------------------
-- 5. TIMESTAMPS AUTOMATION TRIGGERS
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_lessons_timestamp
    BEFORE UPDATE ON public.lessons
    FOR EACH ROW EXECUTE FUNCTION public.handle_update_timestamp();

CREATE TRIGGER update_vocabulary_timestamp
    BEFORE UPDATE ON public.vocabulary
    FOR EACH ROW EXECUTE FUNCTION public.handle_update_timestamp();

CREATE TRIGGER update_study_progress_timestamp
    BEFORE UPDATE ON public.study_progress
    FOR EACH ROW EXECUTE FUNCTION public.handle_update_timestamp();
