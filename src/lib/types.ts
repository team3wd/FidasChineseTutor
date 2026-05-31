// Shared data types used across client components and API routes

export type MasteryStatus = 'NEW' | 'LEARNING' | 'REVIEW' | 'MASTERED';

export interface VocabItem {
  id: string;
  lesson_id: string;
  hanzi: string;
  pinyin: string;
  translation: string;
}

export interface Lesson {
  id: string;
  date: string;
  context_text: string;
}

export interface ProgressEntry {
  interval: number;
  easeFactor: number;
  repetitions: number;
  nextReview: string; // ISO string
  status: MasteryStatus;
  incorrect_count: number;
}

export type LocalStudyProgress = Record<string, ProgressEntry>;
