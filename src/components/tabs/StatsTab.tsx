// Stats tab — study streak, mastery breakdown, toughest words, and conversation readiness

'use client';

import React, { useState, useEffect } from 'react';
import { Flame, BookOpen, MessageCircle } from 'lucide-react';
import { VocabItem, LocalStudyProgress } from '@/lib/types';
import { clusterVocab, ClusterScenario, isClusterStale, getClusterCache } from '@/lib/cluster';

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

export default function StatsTab({ vocabulary, studyProgress }: Props) {
  const [scenarios, setScenarios] = useState<ClusterScenario[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Load cluster scenarios on mount or if vocabulary changed
    const loadScenarios = async () => {
      if (vocabulary.length === 0) {
        setScenarios([]);
        return;
      }

      // Check cache first
      if (!isClusterStale(vocabulary)) {
        const cache = getClusterCache();
        if (cache) {
          setScenarios(cache.scenarios);
          return;
        }
      }

      // Fetch new scenarios
      setLoading(true);
      try {
        const result = await clusterVocab(vocabulary, studyProgress);
        setScenarios(result);
      } catch (err) {
        console.error('Failed to load cluster scenarios:', err);
        setScenarios([]);
      } finally {
        setLoading(false);
      }
    };

    loadScenarios();
  }, [vocabulary.length, studyProgress]); // Re-run when vocab or progress changes

  const newCount = vocabulary.filter(v => !studyProgress[v.hanzi] || studyProgress[v.hanzi].status === 'NEW').length;
  const learningCount = vocabulary.filter(v => studyProgress[v.hanzi]?.status === 'LEARNING').length;
  const reviewCount = vocabulary.filter(v => studyProgress[v.hanzi]?.status === 'REVIEW').length;
  const masteredCount = vocabulary.filter(v => studyProgress[v.hanzi]?.status === 'MASTERED').length;
  const totalStudied = vocabulary.length - newCount;

  const difficultWords = [...vocabulary]
    .filter(v => studyProgress[v.hanzi] && studyProgress[v.hanzi].incorrect_count > 0)
    .sort((a, b) => (studyProgress[b.hanzi]?.incorrect_count || 0) - (studyProgress[a.hanzi]?.incorrect_count || 0))
    .slice(0, 5);

  return (
    <div className="animate-fade-in">
      <h2 style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '4px' }}>
        Study Progress Summary
      </h2>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
        Tracks memory scheduling indices, streaks, and difficult vocabulary.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
        <div style={{
          padding: '16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
          backgroundColor: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <div style={{ padding: '10px', borderRadius: '50%', backgroundColor: 'var(--danger-subtle)', color: 'var(--accent)' }}>
            <Flame size={20} />
          </div>
          <div>
            <span style={{ fontSize: '20px', fontWeight: 700, display: 'block' }}>{getStudyStreak()} Days</span>
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
            <span style={{ fontSize: '20px', fontWeight: 700, display: 'block' }}>{totalStudied} / {vocabulary.length}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Words Studied</span>
          </div>
        </div>
      </div>

      <div style={{
        padding: '20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
        backgroundColor: 'var(--bg-surface)', marginBottom: '20px', boxShadow: 'var(--shadow-sm)'
      }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '14px' }}>Retention Level Distribution</h3>

        <div style={{
          display: 'flex', height: '16px', borderRadius: '8px',
          overflow: 'hidden', backgroundColor: 'var(--bg-app)', marginBottom: '20px'
        }}>
          <div style={{ width: `${vocabulary.length > 0 ? (masteredCount / vocabulary.length) * 100 : 0}%`, backgroundColor: '#10b981' }} />
          <div style={{ width: `${vocabulary.length > 0 ? (reviewCount / vocabulary.length) * 100 : 0}%`, backgroundColor: '#3b82f6' }} />
          <div style={{ width: `${vocabulary.length > 0 ? (learningCount / vocabulary.length) * 100 : 0}%`, backgroundColor: '#eab308' }} />
          <div style={{ width: `${vocabulary.length > 0 ? (newCount / vocabulary.length) * 100 : 0}%`, backgroundColor: 'var(--border)' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
          {[
            { label: `Mastered (${masteredCount})`, color: '#10b981' },
            { label: `Reviewing (${reviewCount})`, color: '#3b82f6' },
            { label: `Learning (${learningCount})`, color: '#eab308' },
            { label: `Unstudied (${newCount})`, color: 'var(--border)' },
          ].map(({ label, color }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        padding: '20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
        backgroundColor: 'var(--bg-surface)'
      }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>Target Review: Toughest Words</h3>

        {difficultWords.length === 0 ? (
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '10px 0' }}>
            No difficult cards recorded. Your retention metrics are optimal.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {difficultWords.map(word => (
              <div
                key={word.id}
                style={{
                  padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-app)', display: 'flex',
                  alignItems: 'center', justifyContent: 'space-between', fontSize: '13px'
                }}
              >
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{word.hanzi}</span>
                  <span style={{ color: 'var(--text-secondary)', marginLeft: '6px', fontSize: '11px' }}>({word.pinyin})</span>
                </div>
                <span style={{
                  fontSize: '11px', padding: '2px 6px', borderRadius: '4px',
                  backgroundColor: 'var(--danger-subtle)', color: 'var(--danger)', fontWeight: 600
                }}>
                  {studyProgress[word.hanzi]?.incorrect_count} Failed guesses
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* What can I talk about? — Conversation readiness */}
      {vocabulary.length > 0 && (
        <div style={{
          padding: '20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
          backgroundColor: 'var(--bg-surface)', marginTop: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <MessageCircle size={18} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>What Can I Talk About?</h3>
          </div>

          {scenarios.length === 0 ? (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>
              {loading ? 'Analyzing your vocabulary…' : 'Approve some vocabulary to see conversation readiness.'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {scenarios.map(scenario => (
                <div key={scenario.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {scenario.name}
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--primary)' }}>
                      {scenario.readiness_pct}%
                    </span>
                  </div>

                  {/* Readiness bar */}
                  <div style={{
                    height: '6px', borderRadius: '3px', backgroundColor: 'var(--bg-app)',
                    overflow: 'hidden', marginBottom: '6px'
                  }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${scenario.readiness_pct}%`,
                        backgroundColor: scenario.readiness_pct >= 70 ? '#10b981' : scenario.readiness_pct >= 40 ? '#eab308' : '#ef4444',
                        transition: 'width 0.3s ease'
                      }}
                    />
                  </div>

                  {/* Sample words */}
                  <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: '6px',
                    fontSize: '11px', color: 'var(--text-secondary)'
                  }}>
                    {scenario.sample_words.slice(0, 3).map((word, idx) => (
                      <span
                        key={idx}
                        style={{
                          padding: '2px 6px', borderRadius: '4px',
                          backgroundColor: 'var(--bg-app)', fontWeight: 500
                        }}
                      >
                        {word}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
