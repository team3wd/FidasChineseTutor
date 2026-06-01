// Flashcards tab — SM-2 spaced repetition review session

'use client';

import React, { useState, useEffect } from 'react';
import { Volume2, Award } from 'lucide-react';
import { VocabItem, Lesson, LocalStudyProgress } from '@/lib/types';
import { calculateSRS, SRSState } from '@/lib/srs';
import { recordReview } from '@/lib/cluster';

interface Props {
  vocabulary: VocabItem[];
  lessons: Lesson[];
  studyProgress: LocalStudyProgress;
  onSave: (lessons: Lesson[], vocab: VocabItem[], progress: LocalStudyProgress, changedHanzi?: string) => void;
  speakHanzi: (hanzi: string) => void;
}

export default function FlashcardsTab({ vocabulary, lessons, studyProgress, onSave, speakHanzi }: Props) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<VocabItem[]>([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  const [reviewMode, setReviewMode] = useState<'due' | 'all'>('due');

  useEffect(() => {
    buildReviewQueue();
  }, [vocabulary, studyProgress, reviewMode]);

  const buildReviewQueue = () => {
    const now = new Date();
    const dueVocab = vocabulary.filter(v => {
      const prog = studyProgress[v.hanzi];
      if (!prog) return true;
      return new Date(prog.nextReview) <= now;
    });

    if (reviewMode === 'due') {
      dueVocab.sort((a, b) => {
        const progA = studyProgress[a.hanzi];
        const progB = studyProgress[b.hanzi];
        if (!progA && !progB) return 0;
        if (!progA) return -1;
        if (!progB) return 1;
        return new Date(progA.nextReview).getTime() - new Date(progB.nextReview).getTime();
      });
      setReviewQueue(dueVocab);
    } else {
      setReviewQueue([...vocabulary].sort(() => 0.5 - Math.random()));
    }

    setCurrentQueueIndex(0);
    setIsFlipped(false);
  };

  const handleGradeSRS = (grade: number) => {
    if (reviewQueue.length === 0) return;
    const currentWord = reviewQueue[currentQueueIndex];

    const currentSRS: SRSState = studyProgress[currentWord.hanzi] || {
      interval: 0, easeFactor: 2.5, repetitions: 0
    };
    const nextSRS = calculateSRS(grade, currentSRS);

    const updatedProgress = { ...studyProgress };
    updatedProgress[currentWord.hanzi] = {
      interval: nextSRS.interval,
      easeFactor: nextSRS.easeFactor,
      repetitions: nextSRS.repetitions,
      nextReview: nextSRS.nextReview.toISOString(),
      status: nextSRS.status,
      incorrect_count: (studyProgress[currentWord.hanzi]?.incorrect_count || 0) + (grade < 3 ? 1 : 0),
    };

    // Record today for streak tracking
    const studyDates: string[] = JSON.parse(localStorage.getItem('ch_study_dates') || '[]');
    const todayStr = new Date().toDateString();
    if (!studyDates.includes(todayStr)) {
      studyDates.push(todayStr);
      localStorage.setItem('ch_study_dates', JSON.stringify(studyDates));
    }

    recordReview();
    onSave(lessons, vocabulary, updatedProgress, currentWord.hanzi);
    setIsFlipped(false);
    setTimeout(() => {
      if (currentQueueIndex + 1 < reviewQueue.length) {
        setCurrentQueueIndex(currentQueueIndex + 1);
      } else {
        setReviewQueue([]);
      }
    }, 200);
  };

  const dueCount = vocabulary.filter(v => {
    const prog = studyProgress[v.hanzi];
    return !prog || new Date(prog.nextReview) <= new Date();
  }).length;

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700 }}>Active Reviews</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {reviewMode === 'due' ? 'Showing only due vocabulary' : 'Reviewing all loaded words'}
          </p>
        </div>
        <select
          value={reviewMode}
          onChange={(e) => setReviewMode(e.target.value as 'due' | 'all')}
          style={{
            padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
            backgroundColor: 'var(--bg-surface)', fontSize: '12px', fontWeight: 500, outline: 'none'
          }}
        >
          <option value="due">Due Cards ({dueCount})</option>
          <option value="all">All Words ({vocabulary.length})</option>
        </select>
      </div>

      {reviewQueue.length === 0 || !reviewQueue[currentQueueIndex] ? (
        <div style={{
          padding: '40px 20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
          textAlign: 'center', backgroundColor: 'var(--bg-surface)', boxShadow: 'var(--shadow-sm)'
        }}>
          <Award size={36} style={{ color: 'var(--primary)', margin: '0 auto 12px auto' }} />
          <p style={{ fontSize: '14px', fontWeight: 600 }}>Your review stack is fully clear.</p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', maxWidth: '280px', margin: '6px auto 16px auto' }}>
            You have studied all cards due for today. Keep up the high retention streak.
          </p>
          <button
            onClick={() => { setReviewMode('all'); buildReviewQueue(); }}
            className="tap-active"
            style={{
              padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
              fontSize: '12px', fontWeight: 500, backgroundColor: 'var(--bg-app)'
            }}
          >
            Review all cards anyway
          </button>
        </div>
      ) : (
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: '14px', fontSize: '12px', color: 'var(--text-secondary)'
          }}>
            <span>Card {currentQueueIndex + 1} of {reviewQueue.length}</span>
            <span>{Math.round((currentQueueIndex / reviewQueue.length) * 100)}% complete</span>
          </div>

          <div style={{
            width: '100%', height: '4px', borderRadius: '2px',
            backgroundColor: 'var(--border)', marginBottom: '24px', overflow: 'hidden'
          }}>
            <div style={{
              width: `${(currentQueueIndex / reviewQueue.length) * 100}%`,
              height: '100%', backgroundColor: 'var(--primary)', transition: 'width var(--transition-fast)'
            }} />
          </div>

          <div
            className={`flip-container ${isFlipped ? 'flipped' : ''}`}
            onClick={() => { setIsFlipped(!isFlipped); if (!isFlipped) speakHanzi(reviewQueue[currentQueueIndex].hanzi); }}
          >
            <div className="flip-card-inner">
              <div className="flip-card-front">
                <span style={{ fontSize: '48px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {reviewQueue[currentQueueIndex].hanzi}
                </span>
                <span style={{
                  fontSize: '11px', color: 'var(--text-muted)', marginTop: '28px',
                  letterSpacing: '0.05em', textTransform: 'uppercase'
                }}>
                  Tap to reveal
                </span>
              </div>

              <div className="flip-card-back">
                <button
                  onClick={(e) => { e.stopPropagation(); speakHanzi(reviewQueue[currentQueueIndex].hanzi); }}
                  style={{
                    padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-app)', fontSize: '12px', display: 'flex',
                    alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', marginBottom: '16px'
                  }}
                >
                  <Volume2 size={14} /> Pronounce
                </button>
                <span style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {reviewQueue[currentQueueIndex].hanzi}
                </span>
                <span style={{ fontSize: '18px', fontStyle: 'italic', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 500 }}>
                  {reviewQueue[currentQueueIndex].pinyin}
                </span>
                <span style={{ fontSize: '15px', color: 'var(--text-muted)', marginTop: '16px', maxWidth: '240px', lineHeight: 1.4 }}>
                  {reviewQueue[currentQueueIndex].translation}
                </span>
              </div>
            </div>
          </div>

          {isFlipped ? (
            <div className="animate-fade-in" style={{ marginTop: '24px' }}>
              <p style={{
                fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center',
                marginBottom: '12px', fontWeight: 500
              }}>
                How well did you remember this card?
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                {[1, 2, 3, 4, 5].map(grade => {
                  const labels = ['Forgot', 'Failed', 'Hard', 'Good', 'Easy'];
                  const colors = ['#ef4444', '#f97316', '#eab308', '#3b82f6', '#10b981'];
                  return (
                    <button
                      key={grade}
                      onClick={(e) => { e.stopPropagation(); handleGradeSRS(grade); }}
                      className="tap-active"
                      style={{
                        padding: '10px 4px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
                        backgroundColor: 'var(--bg-surface)', fontSize: '11px', fontWeight: 600,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px'
                      }}
                    >
                      <span style={{ color: colors[grade - 1], fontSize: '15px', fontWeight: 700 }}>{grade}</span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '9px' }}>{labels[grade - 1]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <p style={{
              fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center',
              marginTop: '24px', fontStyle: 'italic'
            }}>
              Tip: Read the Hanzi aloud, guess the meaning, then tap to check.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
