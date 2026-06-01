// Stats tab — global mastery funnel, per-cluster breakdown, streak, and daily review counts

'use client';

import React, { useState, useEffect } from 'react';
import { Flame, BookOpen, MessageCircle, CalendarDays } from 'lucide-react';
import { VocabItem, LocalStudyProgress, MasteryStatus } from '@/lib/types';
import { clusterVocab, ClusterScenario, isClusterStale, getClusterCache, getReviewCounts } from '@/lib/cluster';

interface Props {
  vocabulary: VocabItem[];
  studyProgress: LocalStudyProgress;
}

function getStudyStreak(): number {
  if (typeof window === 'undefined') return 0;
  const studyDates: string[] = JSON.parse(localStorage.getItem('ch_study_dates') || '[]');
  if (studyDates.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (!studyDates.includes(today.toDateString()) && !studyDates.includes(yesterday.toDateString())) {
    return 0;
  }

  let streak = 0;
  const cursor = new Date(today);
  while (studyDates.includes(cursor.toDateString())) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// ── Mastery helpers ────────────────────────────────────────────────────────────

type MasteryBucket = { new: number; learning: number; review: number; mastered: number; total: number };

function bucketWords(hanziList: string[], studyProgress: LocalStudyProgress): MasteryBucket {
  const b: MasteryBucket = { new: 0, learning: 0, review: 0, mastered: 0, total: hanziList.length };
  for (const h of hanziList) {
    const status = studyProgress[h]?.status as MasteryStatus | undefined;
    if (!status || status === 'NEW') b.new++;
    else if (status === 'LEARNING') b.learning++;
    else if (status === 'REVIEW') b.review++;
    else b.mastered++;
  }
  return b;
}

// ── Mastery bar ────────────────────────────────────────────────────────────────

function MasteryBar({ bucket, compact = false }: { bucket: MasteryBucket; compact?: boolean }) {
  const { new: n, learning, review, mastered, total } = bucket;
  const pct = (v: number) => total > 0 ? (v / total) * 100 : 0;

  return (
    <div>
      <div style={{
        display: 'flex', height: compact ? '8px' : '12px',
        borderRadius: '6px', overflow: 'hidden',
        backgroundColor: 'var(--bg-app)',
      }}>
        <div style={{ width: `${pct(mastered)}%`, backgroundColor: '#10b981', transition: 'width 0.3s' }} />
        <div style={{ width: `${pct(review)}%`, backgroundColor: '#3b82f6', transition: 'width 0.3s' }} />
        <div style={{ width: `${pct(learning)}%`, backgroundColor: '#eab308', transition: 'width 0.3s' }} />
        <div style={{ width: `${pct(n)}%`, backgroundColor: 'var(--border)', transition: 'width 0.3s' }} />
      </div>
      {!compact && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '10px', fontSize: '11px' }}>
          {([
            { label: 'Mastered', count: mastered, color: '#10b981' },
            { label: 'Reviewing', count: review, color: '#3b82f6' },
            { label: 'Learning', count: learning, color: '#eab308' },
            { label: 'New / Unstudied', count: n, color: 'var(--border)' },
          ] as const).map(({ label, count, color }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
              <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)', marginLeft: 'auto' }}>{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function StatsTab({ vocabulary, studyProgress }: Props) {
  const [scenarios, setScenarios] = useState<ClusterScenario[]>([]);
  const [loadingClusters, setLoadingClusters] = useState(false);

  useEffect(() => {
    const loadScenarios = async () => {
      if (vocabulary.length === 0) { setScenarios([]); return; }

      if (!isClusterStale(vocabulary)) {
        const cache = getClusterCache();
        // Reject cache entries that predate the words[] field (M4 addition)
        if (cache && cache.scenarios.every(s => Array.isArray(s.words))) {
          setScenarios(cache.scenarios); return;
        }
      }

      setLoadingClusters(true);
      try {
        const result = await clusterVocab(vocabulary, studyProgress);
        setScenarios(result);
      } catch (err) {
        console.error('Failed to load cluster scenarios:', err);
        setScenarios([]);
      } finally {
        setLoadingClusters(false);
      }
    };
    loadScenarios();
  }, [vocabulary.length]);

  // ── Derived stats ────────────────────────────────────────────────────────────
  const streak = getStudyStreak();
  const { today: reviewsToday, thisWeek: reviewsThisWeek } = getReviewCounts();
  const allHanzi = vocabulary.map(v => v.hanzi);
  const globalBucket = bucketWords(allHanzi, studyProgress);

  const difficultWords = [...vocabulary]
    .filter(v => (studyProgress[v.hanzi]?.incorrect_count || 0) > 0)
    .sort((a, b) => (studyProgress[b.hanzi]?.incorrect_count || 0) - (studyProgress[a.hanzi]?.incorrect_count || 0))
    .slice(0, 5);

  return (
    <div className="animate-fade-in">
      <h2 style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '4px' }}>
        Study Progress
      </h2>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
        Global mastery, per-topic breakdown, and review activity.
      </p>

      {/* ── Row 1: streak + words studied ──────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
        <div style={{
          padding: '16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
          backgroundColor: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <div style={{ padding: '10px', borderRadius: '50%', backgroundColor: 'var(--danger-subtle)', color: 'var(--accent)' }}>
            <Flame size={20} />
          </div>
          <div>
            <span style={{ fontSize: '20px', fontWeight: 700, display: 'block' }}>{streak} Days</span>
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Active Streak</span>
          </div>
        </div>

        <div style={{
          padding: '16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
          backgroundColor: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <div style={{ padding: '10px', borderRadius: '50%', backgroundColor: 'var(--primary-subtle)', color: 'var(--primary)' }}>
            <BookOpen size={20} />
          </div>
          <div>
            <span style={{ fontSize: '20px', fontWeight: 700, display: 'block' }}>
              {vocabulary.length - globalBucket.new} / {vocabulary.length}
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Words Touched</span>
          </div>
        </div>
      </div>

      {/* ── Row 2: reviews today + this week ───────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
        <div style={{
          padding: '16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
          backgroundColor: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <div style={{ padding: '10px', borderRadius: '50%', backgroundColor: 'var(--success-subtle)', color: 'var(--success)' }}>
            <CalendarDays size={20} />
          </div>
          <div>
            <span style={{ fontSize: '20px', fontWeight: 700, display: 'block' }}>{reviewsToday}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Reviews Today</span>
          </div>
        </div>

        <div style={{
          padding: '16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
          backgroundColor: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <div style={{ padding: '10px', borderRadius: '50%', backgroundColor: 'var(--success-subtle)', color: 'var(--success)' }}>
            <CalendarDays size={20} />
          </div>
          <div>
            <span style={{ fontSize: '20px', fontWeight: 700, display: 'block' }}>{reviewsThisWeek}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Reviews This Week</span>
          </div>
        </div>
      </div>

      {/* ── Global mastery funnel ───────────────────────────────────────────── */}
      <div style={{
        padding: '20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
        backgroundColor: 'var(--bg-surface)', marginBottom: '20px', boxShadow: 'var(--shadow-sm)'
      }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>Global Mastery</h3>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '14px' }}>
          All {vocabulary.length} words in your study bank
        </p>
        <MasteryBar bucket={globalBucket} />
      </div>

      {/* ── Per-cluster breakdown ───────────────────────────────────────────── */}
      {vocabulary.length > 0 && (
        <div style={{
          padding: '20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
          backgroundColor: 'var(--bg-surface)', marginBottom: '20px', boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <MessageCircle size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
            <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>By Topic</h3>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Mastery breakdown per conversation cluster
          </p>

          {loadingClusters || scenarios.length === 0 ? (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>
              {loadingClusters ? 'Analysing vocabulary…' : 'Approve some vocabulary to see topic breakdowns.'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {scenarios.map(scenario => {
                const topicHanzi = scenario.words?.length > 0 ? scenario.words : scenario.sample_words;
                const b = bucketWords(topicHanzi, studyProgress);
                const masteredPct = b.total > 0 ? Math.round((b.mastered / b.total) * 100) : 0;

                return (
                  <div key={scenario.name}>
                    {/* Header row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {scenario.name}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px', whiteSpace: 'nowrap' }}>
                        {b.total} words · {masteredPct}% mastered
                      </span>
                    </div>

                    {/* Mastery bar (compact) */}
                    <MasteryBar bucket={b} compact />

                    {/* Legend inline */}
                    <div style={{ display: 'flex', gap: '10px', marginTop: '6px', fontSize: '10px', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                      {b.mastered > 0 && <span style={{ color: '#10b981' }}>✓ {b.mastered} mastered</span>}
                      {b.review > 0 && <span style={{ color: '#3b82f6' }}>↻ {b.review} reviewing</span>}
                      {b.learning > 0 && <span style={{ color: '#eab308' }}>~ {b.learning} learning</span>}
                      {b.new > 0 && <span style={{ color: 'var(--text-muted)' }}>○ {b.new} new</span>}
                    </div>

                    {/* Sample words chips */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '8px' }}>
                      {scenario.sample_words.slice(0, 3).map((w, i) => (
                        <span key={i} style={{
                          padding: '2px 7px', borderRadius: '4px', fontSize: '12px',
                          backgroundColor: 'var(--bg-app)', color: 'var(--text-secondary)', fontWeight: 500
                        }}>{w}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Toughest words ──────────────────────────────────────────────────── */}
      <div style={{
        padding: '20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
        backgroundColor: 'var(--bg-surface)'
      }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>Toughest Words</h3>

        {difficultWords.length === 0 ? (
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '10px 0' }}>
            No failed cards yet. Keep it up!
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {difficultWords.map(word => (
              <div key={word.id} style={{
                padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--bg-app)', display: 'flex',
                alignItems: 'center', justifyContent: 'space-between', fontSize: '13px'
              }}>
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{word.hanzi}</span>
                  <span style={{ color: 'var(--text-secondary)', marginLeft: '6px', fontSize: '11px' }}>({word.pinyin})</span>
                </div>
                <span style={{
                  fontSize: '11px', padding: '2px 6px', borderRadius: '4px',
                  backgroundColor: 'var(--danger-subtle)', color: 'var(--danger)', fontWeight: 600
                }}>
                  {studyProgress[word.hanzi]?.incorrect_count} failed
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
