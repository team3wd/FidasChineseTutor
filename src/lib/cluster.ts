// Helper to cluster vocabulary and manage localStorage caching.

import { VocabItem, LocalStudyProgress } from './types';

export interface ClusterScenario {
  name: string;
  readiness_pct: number;
  sample_words: string[];
}

export interface ClusterCache {
  vocab_count: number;
  scenarios: ClusterScenario[];
  generated_at: string;
}

const CACHE_KEY = 'cluster_cache';

export function getClusterCache(): ClusterCache | null {
  if (typeof window === 'undefined') return null;
  const cached = localStorage.getItem(CACHE_KEY);
  if (!cached) return null;
  try {
    return JSON.parse(cached);
  } catch {
    return null;
  }
}

export function isClusterStale(vocab: VocabItem[]): boolean {
  const cache = getClusterCache();
  if (!cache) return true;
  // Stale if vocab count changed (means new words were added/removed)
  return cache.vocab_count !== vocab.length;
}

export function saveClusterCache(scenarios: ClusterScenario[], vocab: VocabItem[]) {
  if (typeof window === 'undefined') return;
  const cache: ClusterCache = {
    vocab_count: vocab.length,
    scenarios,
    generated_at: new Date().toISOString(),
  };
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

interface VocabWithInterval extends VocabItem {
  interval: number;
}

export async function clusterVocab(vocab: VocabItem[], studyProgress: LocalStudyProgress): Promise<ClusterScenario[]> {
  // Check cache first
  const cache = getClusterCache();
  if (cache && !isClusterStale(vocab)) {
    return cache.scenarios;
  }

  // Augment vocab with interval data from studyProgress
  const vocabWithInterval: VocabWithInterval[] = vocab.map(v => ({
    ...v,
    interval: studyProgress[v.hanzi]?.interval || 0,
  }));

  // Fetch from API
  try {
    const response = await fetch('/api/cluster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vocab: vocabWithInterval }),
    });

    if (!response.ok) {
      console.error('Cluster API error:', response.status);
      return [];
    }

    const data: { scenarios: ClusterScenario[] } = await response.json();

    // Save to cache
    if (data.scenarios && Array.isArray(data.scenarios)) {
      saveClusterCache(data.scenarios, vocab);
      return data.scenarios;
    }

    return [];
  } catch (err) {
    console.error('Cluster fetch error:', err);
    return [];
  }
}

export function invalidateClusterCache() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CACHE_KEY);
}
