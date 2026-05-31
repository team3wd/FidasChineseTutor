// Lessons tab — browse lessons by date, read context stories with interactive vocab tooltips

'use client';

import React, { useState } from 'react';
import { Volume2, ChevronRight, BookMarked, X } from 'lucide-react';
import { Lesson, VocabItem } from '@/lib/types';

interface Props {
  lessons: Lesson[];
  vocabulary: VocabItem[];
  speakHanzi: (hanzi: string) => void;
}

interface TooltipState {
  hanzi: string;
  pinyin: string;
  translation: string;
}

export default function LessonsTab({ lessons, vocabulary, speakHanzi }: Props) {
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [activeTooltip, setActiveTooltip] = useState<TooltipState | null>(null);

  const renderInteractiveStory = (text: string) => {
    if (!text) return <p className="text-secondary italic">No context story provided for this lesson.</p>;

    const sortedVocab = [...vocabulary].sort((a, b) => b.hanzi.length - a.hanzi.length);
    const foundVocabs = sortedVocab.filter(v => text.includes(v.hanzi));

    if (foundVocabs.length === 0) {
      return <p className="text-primary" style={{ lineHeight: '1.8', whiteSpace: 'pre-line' }}>{text}</p>;
    }

    const parts = text.split('\n\n');
    return (
      <div style={{ lineHeight: '1.8', whiteSpace: 'pre-line' }}>
        {parts.map((part, pIdx) => {
          let currentSegment = part;
          const segmentElements: React.ReactNode[] = [];
          let keyCounter = 0;

          while (currentSegment.length > 0) {
            let earliestMatch: { index: number; word: VocabItem } | null = null;

            for (const v of foundVocabs) {
              const idx = currentSegment.indexOf(v.hanzi);
              if (idx !== -1 && (!earliestMatch || idx < earliestMatch.index)) {
                earliestMatch = { index: idx, word: v };
              }
            }

            if (earliestMatch) {
              const { index, word } = earliestMatch;
              if (index > 0) {
                segmentElements.push(<span key={`txt-${keyCounter++}`}>{currentSegment.substring(0, index)}</span>);
              }
              segmentElements.push(
                <span
                  key={`wd-${keyCounter++}`}
                  onClick={() => { setActiveTooltip(word); speakHanzi(word.hanzi); }}
                  style={{
                    color: 'var(--primary)',
                    borderBottom: '1px dotted var(--primary)',
                    cursor: 'pointer',
                    fontWeight: 500,
                    padding: '0 2px'
                  }}
                >
                  {word.hanzi}
                </span>
              );
              currentSegment = currentSegment.substring(index + word.hanzi.length);
            } else {
              segmentElements.push(<span key={`txt-${keyCounter++}`}>{currentSegment}</span>);
              break;
            }
          }

          return <p key={`p-${pIdx}`} style={{ marginBottom: '16px' }}>{segmentElements}</p>;
        })}
      </div>
    );
  };

  return (
    <div className="animate-fade-in">
      {selectedLesson ? (
        <div>
          <button
            onClick={() => { setSelectedLesson(null); setActiveTooltip(null); }}
            style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            ← Back to lessons
          </button>

          <div style={{
            padding: '20px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--bg-surface)',
            boxShadow: 'var(--shadow-sm)',
            marginBottom: '20px'
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>
              Lesson on {new Date(selectedLesson.date).toLocaleDateString(undefined, {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
              })}
            </h2>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '16px' }}>
              {vocabulary.filter(v => v.lesson_id === selectedLesson.id).length} Vocabulary items
            </span>
            <hr style={{ border: 0, borderTop: '1px solid var(--border)', marginBottom: '16px' }} />
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Tutor Story & Context
            </h3>
            {renderInteractiveStory(selectedLesson.context_text)}
          </div>

          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px', marginTop: '24px' }}>
            Lesson Vocabulary List
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {vocabulary
              .filter(v => v.lesson_id === selectedLesson.id)
              .map(vocab => (
                <div
                  key={vocab.id}
                  style={{
                    padding: '14px 16px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>{vocab.hanzi}</span>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>{vocab.pinyin}</span>
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>{vocab.translation}</p>
                  </div>
                  <button
                    onClick={() => speakHanzi(vocab.hanzi)}
                    className="tap-active"
                    style={{ padding: '8px', borderRadius: '50%', backgroundColor: 'var(--bg-app)', color: 'var(--text-secondary)' }}
                  >
                    <Volume2 size={16} />
                  </button>
                </div>
              ))}
          </div>
        </div>
      ) : (
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '4px' }}>
            Your Tutor Lessons
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
            Sync the Google Doc to pull new lessons. Tap a lesson to read.
          </p>

          {lessons.length === 0 ? (
            <div style={{
              padding: '40px 20px',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)',
              textAlign: 'center',
              backgroundColor: 'var(--bg-surface)'
            }}>
              <BookMarked size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 12px auto' }} />
              <p style={{ fontSize: '14px', fontWeight: 500 }}>No vocabulary data loaded yet.</p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', maxWidth: '280px', margin: '6px auto 0 auto' }}>
                Click the "Sync Doc" button at the top right to parse and download vocabulary from your teacher's doc.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {lessons.map(lesson => {
                const count = vocabulary.filter(v => v.lesson_id === lesson.id).length;
                return (
                  <div
                    key={lesson.id}
                    onClick={() => setSelectedLesson(lesson)}
                    className="tap-active"
                    style={{
                      padding: '16px',
                      borderRadius: 'var(--radius-lg)',
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--bg-surface)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'border var(--transition-fast)'
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {new Date(lesson.date).toLocaleDateString(undefined, {
                          weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
                        })}
                      </span>
                      <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {count} vocabulary items synced
                      </span>
                    </div>
                    <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Floating vocab tooltip — position:fixed so it always sits above the nav */}
      {activeTooltip && (
        <div style={{
          position: 'fixed',
          bottom: '84px',
          left: '16px',
          right: '16px',
          padding: '16px',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          backgroundColor: 'var(--bg-surface)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          animation: 'fadeIn var(--transition-fast) forwards',
          zIndex: 100
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '20px', fontWeight: 700 }}>{activeTooltip.hanzi}</span>
              <span style={{ fontSize: '13px', fontStyle: 'italic', color: 'var(--text-secondary)' }}>{activeTooltip.pinyin}</span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>{activeTooltip.translation}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={() => speakHanzi(activeTooltip.hanzi)}
              className="tap-active"
              style={{ padding: '8px', borderRadius: '50%', backgroundColor: 'var(--bg-app)', color: 'var(--text-secondary)' }}
            >
              <Volume2 size={16} />
            </button>
            <button
              onClick={() => setActiveTooltip(null)}
              style={{ padding: '8px', borderRadius: '50%', color: 'var(--text-muted)' }}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
