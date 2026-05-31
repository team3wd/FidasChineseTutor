// Pending vocab queue (localStorage key: ch_pending) — AI-parsed words awaiting user approval before entering the study bank

export interface PendingVocabItem {
  id: string;           // Temp client-side ID (lessonDate_index)
  hanzi: string;
  pinyin: string;
  translation: string;
  confidence: 'high' | 'low'; // 'low' = needs user attention
}

export interface PendingLesson {
  date: string;
  rawLineCount: number;       // How many raw lines were sent to Gemini
  items: PendingVocabItem[];
}

export type PendingStore = {
  [dateStr: string]: PendingLesson;
};

const STORAGE_KEY = 'ch_pending';

export function loadPending(): PendingStore {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function savePending(store: PendingStore): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function clearPendingLesson(dateStr: string): void {
  const store = loadPending();
  delete store[dateStr];
  savePending(store);
}

export function totalPendingCount(store: PendingStore): number {
  return Object.values(store).reduce((sum, lesson) => sum + lesson.items.length, 0);
}
