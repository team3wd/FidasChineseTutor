// Supabase progress sync — load and upsert SRS state for a logged-in user

import { supabase } from './supabase';
import { LocalStudyProgress, ProgressEntry } from './types';

type SupabaseRow = {
  hanzi: string;
  interval: number;
  ease_factor: number;
  repetitions: number;
  next_review: string;
  status: string;
  incorrect_count: number;
  updated_at: string;
};

export async function loadProgressFromSupabase(userId: string): Promise<LocalStudyProgress> {
  const { data, error } = await supabase
    .from('user_progress')
    .select('hanzi,interval,ease_factor,repetitions,next_review,status,incorrect_count,updated_at')
    .eq('user_id', userId);

  if (error || !data) return {};

  const result: LocalStudyProgress = {};
  for (const row of data as SupabaseRow[]) {
    result[row.hanzi] = {
      interval: row.interval,
      easeFactor: row.ease_factor,
      repetitions: row.repetitions,
      nextReview: row.next_review,
      status: row.status as ProgressEntry['status'],
      incorrect_count: row.incorrect_count,
    };
  }
  return result;
}

export async function upsertProgressEntry(
  userId: string,
  hanzi: string,
  entry: ProgressEntry
): Promise<void> {
  await supabase.from('user_progress').upsert(
    {
      user_id: userId,
      hanzi,
      interval: entry.interval,
      ease_factor: entry.easeFactor,
      repetitions: entry.repetitions,
      next_review: entry.nextReview,
      status: entry.status,
      incorrect_count: entry.incorrect_count,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,hanzi' }
  );
}

// Merge local progress into Supabase, keeping whichever entry has the later updated_at.
// For local entries without an updated_at, we treat them as older than any Supabase row.
export async function syncLocalToSupabase(
  userId: string,
  localProgress: LocalStudyProgress,
  remoteProgress: LocalStudyProgress
): Promise<LocalStudyProgress> {
  const merged: LocalStudyProgress = { ...remoteProgress };

  const upserts: object[] = [];
  for (const [hanzi, localEntry] of Object.entries(localProgress)) {
    if (!remoteProgress[hanzi]) {
      merged[hanzi] = localEntry;
      upserts.push({
        user_id: userId,
        hanzi,
        interval: localEntry.interval,
        ease_factor: localEntry.easeFactor,
        repetitions: localEntry.repetitions,
        next_review: localEntry.nextReview,
        status: localEntry.status,
        incorrect_count: localEntry.incorrect_count,
        updated_at: new Date().toISOString(),
      });
    }
  }

  if (upserts.length > 0) {
    await supabase.from('user_progress').upsert(upserts, { onConflict: 'user_id,hanzi' });
  }

  return merged;
}
