// Practice tab — tone guessing and multiple choice vocabulary games

'use client';

import React, { useState, useEffect } from 'react';
import { Volume2, Check, X, AlertCircle } from 'lucide-react';
import { VocabItem, Lesson, LocalStudyProgress } from '@/lib/types';

interface Props {
  vocabulary: VocabItem[];
  lessons: Lesson[];
  studyProgress: LocalStudyProgress;
  onSave: (lessons: Lesson[], vocab: VocabItem[], progress: LocalStudyProgress) => void;
  speakHanzi: (hanzi: string) => void;
}

function getToneNumber(pinyin: string): number {
  if (/[āēīōūǖ]/i.test(pinyin)) return 1;
  if (/[áéíóúǘ]/i.test(pinyin)) return 2;
  if (/[ǎěǐǒǔǚ]/i.test(pinyin)) return 3;
  if (/[àèìòùǜ]/i.test(pinyin)) return 4;
  return 5;
}

export default function PracticeTab({ vocabulary, lessons, studyProgress, onSave, speakHanzi }: Props) {
  const [toneGameWord, setToneGameWord] = useState<VocabItem | null>(null);
  const [toneFeedback, setToneFeedback] = useState<{ isCorrect: boolean; selected: number } | null>(null);
  const [mcWord, setMcWord] = useState<VocabItem | null>(null);
  const [mcOptions, setMcOptions] = useState<string[]>([]);
  const [mcFeedback, setMcFeedback] = useState<{ isCorrect: boolean; selected: string } | null>(null);

  useEffect(() => {
    if (vocabulary.length > 0) {
      pickNewToneWord();
      pickNewMcWord();
    }
  }, []);

  const pickNewToneWord = () => {
    if (vocabulary.length === 0) return;
    const eligible = vocabulary.filter(v => v.pinyin && /[āáǎàēéěèīíǐìōóǒòūúǔùüǘǚǜū]/i.test(v.pinyin));
    const pool = eligible.length > 0 ? eligible : vocabulary;
    setToneGameWord(pool[Math.floor(Math.random() * pool.length)]);
    setToneFeedback(null);
  };

  const pickNewMcWord = () => {
    if (vocabulary.length === 0) return;
    const randomWord = vocabulary[Math.floor(Math.random() * vocabulary.length)];
    const otherTranslations = vocabulary
      .filter(v => v.id !== randomWord.id)
      .map(v => v.translation)
      .filter((val, idx, self) => self.indexOf(val) === idx);
    const options = [randomWord.translation, ...otherTranslations.sort(() => 0.5 - Math.random()).slice(0, 3)]
      .sort(() => 0.5 - Math.random());
    setMcWord(randomWord);
    setMcOptions(options);
    setMcFeedback(null);
  };

  const handleToneSelection = (toneNum: number) => {
    if (!toneGameWord || toneFeedback) return;
    const correctTone = getToneNumber(toneGameWord.pinyin);
    const isCorrect = toneNum === correctTone;

    if (!isCorrect) {
      const updatedProgress = { ...studyProgress };
      if (updatedProgress[toneGameWord.hanzi]) {
        updatedProgress[toneGameWord.hanzi].incorrect_count += 1;
        onSave(lessons, vocabulary, updatedProgress);
      }
    }
    setToneFeedback({ isCorrect, selected: toneNum });
  };

  const handleMcSelection = (option: string) => {
    if (!mcWord || mcFeedback) return;
    const isCorrect = option === mcWord.translation;

    if (!isCorrect) {
      const updatedProgress = { ...studyProgress };
      if (updatedProgress[mcWord.hanzi]) {
        updatedProgress[mcWord.hanzi].incorrect_count += 1;
        onSave(lessons, vocabulary, updatedProgress);
      }
    }
    setMcFeedback({ isCorrect, selected: option });
  };

  if (vocabulary.length < 5) {
    return (
      <div className="animate-fade-in">
        <h2 style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '4px' }}>Practice Games</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Choose a quick-fire training game to strengthen tone recognition and vocabulary matching.
        </p>
        <div style={{
          padding: '40px 20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
          textAlign: 'center', backgroundColor: 'var(--bg-surface)'
        }}>
          <AlertCircle size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 12px auto' }} />
          <p style={{ fontSize: '14px', fontWeight: 500 }}>Not enough vocabulary loaded.</p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
            Please sync at least 5 words from the Google Doc to unlock active training games.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <h2 style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '4px' }}>Practice Games</h2>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
        Choose a quick-fire training game to strengthen tone recognition and vocabulary matching.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* GAME 1: TONE GUESSING */}
        <div style={{
          padding: '20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
          backgroundColor: 'var(--bg-surface)', boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <span style={{
              padding: '4px 8px', borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--primary-subtle)', color: 'var(--primary)', fontSize: '11px', fontWeight: 600
            }}>Game 1</span>
            <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Mandarin Tone Practice</h3>
          </div>

          {toneGameWord && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '36px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                {toneGameWord.hanzi}
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                {toneGameWord.translation}
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', marginBottom: '16px' }}>
                {[1, 2, 3, 4, 5].map(tNum => {
                  const toneSymbols = ['¯ (1)', '´ (2)', 'ˇ (3)', '` (4)', '· (5)'];
                  const isCorrect = tNum === getToneNumber(toneGameWord.pinyin);
                  const isSelected = toneFeedback?.selected === tNum;

                  let btnBg = 'var(--bg-app)';
                  let btnBorder = 'var(--border)';
                  let btnTextColor = 'var(--text-primary)';

                  if (toneFeedback) {
                    if (isCorrect) { btnBg = 'var(--success-subtle)'; btnBorder = 'var(--success)'; btnTextColor = 'var(--success)'; }
                    else if (isSelected) { btnBg = 'var(--danger-subtle)'; btnBorder = 'var(--danger)'; btnTextColor = 'var(--danger)'; }
                  }

                  return (
                    <button
                      key={tNum}
                      disabled={!!toneFeedback}
                      onClick={() => handleToneSelection(tNum)}
                      className="tap-active"
                      style={{
                        padding: '12px 2px', borderRadius: 'var(--radius-md)',
                        border: `1px solid ${btnBorder}`, backgroundColor: btnBg,
                        color: btnTextColor, fontSize: '11px', fontWeight: 600
                      }}
                    >
                      {toneSymbols[tNum - 1]}
                    </button>
                  );
                })}
              </div>

              {toneFeedback ? (
                <div className="animate-fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '10px' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600,
                    color: toneFeedback.isCorrect ? 'var(--success)' : 'var(--danger)'
                  }}>
                    {toneFeedback.isCorrect
                      ? <><Check size={16} /> Perfect! Pronounced: {toneGameWord.pinyin}</>
                      : <><X size={16} /> Incorrect. It is {toneGameWord.pinyin}</>}
                  </div>
                  <button
                    onClick={() => speakHanzi(toneGameWord.hanzi)}
                    style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'underline' }}
                  >
                    <Volume2 size={12} /> Listen
                  </button>
                  <button
                    onClick={pickNewToneWord}
                    className="tap-active"
                    style={{
                      marginTop: '6px', padding: '8px 16px', borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--text-primary)', color: 'var(--bg-surface)', fontSize: '12px', fontWeight: 600
                    }}
                  >
                    Next Word
                  </button>
                </div>
              ) : (
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Select the correct tone accent for this Hanzi character.
                </p>
              )}
            </div>
          )}
        </div>

        {/* GAME 2: MULTIPLE CHOICE */}
        <div style={{
          padding: '20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
          backgroundColor: 'var(--bg-surface)', boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <span style={{
              padding: '4px 8px', borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--primary-subtle)', color: 'var(--primary)', fontSize: '11px', fontWeight: 600
            }}>Game 2</span>
            <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Multiple Choice Match</h3>
          </div>

          {mcWord && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '36px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                {mcWord.hanzi}
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: '16px' }}>
                {mcWord.pinyin}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                {mcOptions.map((opt, oIdx) => {
                  const isCorrect = opt === mcWord.translation;
                  const isSelected = mcFeedback?.selected === opt;

                  let btnBg = 'var(--bg-app)';
                  let btnBorder = 'var(--border)';
                  let btnTextColor = 'var(--text-primary)';

                  if (mcFeedback) {
                    if (isCorrect) { btnBg = 'var(--success-subtle)'; btnBorder = 'var(--success)'; btnTextColor = 'var(--success)'; }
                    else if (isSelected) { btnBg = 'var(--danger-subtle)'; btnBorder = 'var(--danger)'; btnTextColor = 'var(--danger)'; }
                  }

                  return (
                    <button
                      key={oIdx}
                      disabled={!!mcFeedback}
                      onClick={() => handleMcSelection(opt)}
                      className="tap-active"
                      style={{
                        padding: '12px 16px', borderRadius: 'var(--radius-md)',
                        border: `1px solid ${btnBorder}`, backgroundColor: btnBg, color: btnTextColor,
                        fontSize: '13px', fontWeight: 500, textAlign: 'left',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                      }}
                    >
                      <span>{opt}</span>
                      {mcFeedback && isCorrect && <Check size={14} />}
                      {mcFeedback && isSelected && !isCorrect && <X size={14} />}
                    </button>
                  );
                })}
              </div>

              {mcFeedback ? (
                <div className="animate-fade-in">
                  <p style={{
                    fontSize: '13px', fontWeight: 600, marginBottom: '10px',
                    color: mcFeedback.isCorrect ? 'var(--success)' : 'var(--danger)'
                  }}>
                    {mcFeedback.isCorrect ? 'Excellent! That is correct.' : `Incorrect. Correct: "${mcWord.translation}"`}
                  </p>
                  <button
                    onClick={pickNewMcWord}
                    className="tap-active"
                    style={{
                      padding: '8px 16px', borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--text-primary)', color: 'var(--bg-surface)', fontSize: '12px', fontWeight: 600
                    }}
                  >
                    Next Character
                  </button>
                </div>
              ) : (
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Select the correct translation representing this Chinese character.
                </p>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
