// Review tab — inspect, edit, approve, or reject AI-parsed vocab before it enters the study bank

'use client';

import React, { useState } from 'react';
import { Check, X, Volume2, Pencil, ClipboardCheck, ChevronRight } from 'lucide-react';
import { Lesson, VocabItem, LocalStudyProgress } from '@/lib/types';
import { PendingStore, loadPending, savePending } from '@/lib/pending';

interface Props {
  pendingStore: PendingStore;
  onPendingUpdate: (store: PendingStore) => void;
  lessons: Lesson[];
  vocabulary: VocabItem[];
  studyProgress: LocalStudyProgress;
  onSave: (lessons: Lesson[], vocab: VocabItem[], progress: LocalStudyProgress) => void;
  speakHanzi: (hanzi: string) => void;
}

export default function ReviewTab({
  pendingStore, onPendingUpdate, lessons, vocabulary, studyProgress, onSave, speakHanzi
}: Props) {
  const [reviewLesson, setReviewLesson] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editHanzi, setEditHanzi] = useState('');
  const [editPinyin, setEditPinyin] = useState('');
  const [editTranslation, setEditTranslation] = useState('');

  const approvePendingItem = (dateStr: string, itemId: string) => {
    const store = loadPending();
    const lesson = store[dateStr];
    if (!lesson) return;
    const item = lesson.items.find(i => i.id === itemId);
    if (!item) return;

    const lessonId = `l_${dateStr}`;
    const newVocab: VocabItem = {
      id: `v_${itemId}`,
      lesson_id: lessonId,
      hanzi: item.hanzi,
      pinyin: item.pinyin,
      translation: item.translation,
    };

    const updatedLessons = [...lessons];
    if (!updatedLessons.find(l => l.id === lessonId)) {
      updatedLessons.unshift({ id: lessonId, date: dateStr, context_text: '' });
      updatedLessons.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    const updatedVocab = [...vocabulary];
    if (!updatedVocab.find(v => v.hanzi === item.hanzi && v.lesson_id === lessonId)) {
      updatedVocab.push(newVocab);
    }

    const updatedProgress = { ...studyProgress };
    if (!updatedProgress[item.hanzi]) {
      updatedProgress[item.hanzi] = {
        interval: 0, easeFactor: 2.5, repetitions: 0,
        nextReview: new Date().toISOString(), status: 'NEW', incorrect_count: 0,
      };
    }

    onSave(updatedLessons, updatedVocab, updatedProgress);

    store[dateStr].items = store[dateStr].items.filter(i => i.id !== itemId);
    if (store[dateStr].items.length === 0) delete store[dateStr];
    savePending(store);
    onPendingUpdate({ ...store });
  };

  const approveAllInLesson = (dateStr: string) => {
    const store = loadPending();
    const lesson = store[dateStr];
    if (!lesson) return;
    // Snapshot item IDs since approving mutates the store
    const ids = lesson.items.map(i => i.id);
    ids.forEach(id => approvePendingItem(dateStr, id));
  };

  const rejectPendingItem = (dateStr: string, itemId: string) => {
    const store = loadPending();
    if (!store[dateStr]) return;
    store[dateStr].items = store[dateStr].items.filter(i => i.id !== itemId);
    if (store[dateStr].items.length === 0) delete store[dateStr];
    savePending(store);
    onPendingUpdate({ ...store });
  };

  const saveItemEdit = (dateStr: string, itemId: string) => {
    const store = loadPending();
    const lesson = store[dateStr];
    if (!lesson) return;
    const item = lesson.items.find(i => i.id === itemId);
    if (!item) return;
    item.hanzi = editHanzi;
    item.pinyin = editPinyin;
    item.translation = editTranslation;
    item.confidence = 'high';
    savePending(store);
    onPendingUpdate({ ...store });
    setEditingItem(null);
  };

  if (reviewLesson) {
    const lesson = pendingStore[reviewLesson];
    if (!lesson) return null;

    return (
      <div className="animate-fade-in" style={{ padding: '16px 16px 80px 16px' }}>
        <button
          onClick={() => { setReviewLesson(null); setEditingItem(null); }}
          style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          ← Back to lessons
        </button>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '17px', fontWeight: 700 }}>
              {new Date(lesson.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </h2>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {lesson.items.length} words pending · {lesson.items.filter(i => i.confidence === 'low').length} need attention
            </p>
          </div>
          <button
            onClick={() => approveAllInLesson(reviewLesson)}
            className="tap-active"
            style={{
              padding: '8px 14px', borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--primary)', color: '#fff',
              fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <Check size={13} /> Approve All
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {lesson.items.map(item => (
            <div
              key={item.id}
              style={{
                padding: '14px', borderRadius: 'var(--radius-md)',
                border: `1px solid ${item.confidence === 'low' ? 'var(--accent)' : 'var(--border)'}`,
                backgroundColor: item.confidence === 'low' ? 'rgba(217,119,6,0.06)' : 'var(--bg-surface)',
              }}
            >
              {editingItem === item.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(['Hanzi', 'Pinyin', 'Translation'] as const).map(field => {
                    const val = field === 'Hanzi' ? editHanzi : field === 'Pinyin' ? editPinyin : editTranslation;
                    const setter = field === 'Hanzi' ? setEditHanzi : field === 'Pinyin' ? setEditPinyin : setEditTranslation;
                    return (
                      <div key={field}>
                        <label style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{field}</label>
                        <input
                          value={val}
                          onChange={e => setter(e.target.value)}
                          style={{
                            display: 'block', width: '100%', marginTop: '4px',
                            padding: '8px 10px', borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-focus)', backgroundColor: 'var(--bg-app)',
                            fontSize: field === 'Hanzi' ? '20px' : '14px',
                            color: 'var(--text-primary)', outline: 'none',
                          }}
                        />
                      </div>
                    );
                  })}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <button
                      onClick={() => saveItemEdit(reviewLesson, item.id)}
                      style={{ flex: 1, padding: '8px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--primary)', color: '#fff', fontSize: '12px', fontWeight: 600 }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingItem(null)}
                      style={{ padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '12px' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {item.confidence === 'low' && (
                      <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>
                        ⚠ Review needed
                      </span>
                    )}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{item.hanzi}</span>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>{item.pinyin || '—'}</span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.translation || '(no translation)'}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button onClick={() => speakHanzi(item.hanzi)} className="tap-active" style={{ padding: '7px', borderRadius: '50%', backgroundColor: 'var(--bg-app)', color: 'var(--text-secondary)' }}>
                      <Volume2 size={14} />
                    </button>
                    <button
                      onClick={() => { setEditingItem(item.id); setEditHanzi(item.hanzi); setEditPinyin(item.pinyin); setEditTranslation(item.translation); }}
                      className="tap-active"
                      style={{ padding: '7px', borderRadius: '50%', backgroundColor: 'var(--bg-app)', color: 'var(--text-secondary)' }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => approvePendingItem(reviewLesson, item.id)} className="tap-active" style={{ padding: '7px', borderRadius: '50%', backgroundColor: 'var(--success-subtle)', color: 'var(--success)' }}>
                      <Check size={14} />
                    </button>
                    <button onClick={() => rejectPendingItem(reviewLesson, item.id)} className="tap-active" style={{ padding: '7px', borderRadius: '50%', backgroundColor: 'var(--danger-subtle)', color: 'var(--danger)' }}>
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ padding: '16px 16px 80px 16px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '4px' }}>Review Queue</h2>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
        AI-parsed words waiting for your approval before entering your study bank.
      </p>

      {Object.keys(pendingStore).length === 0 ? (
        <div style={{ padding: '40px 20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', textAlign: 'center', backgroundColor: 'var(--bg-surface)' }}>
          <ClipboardCheck size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 12px auto' }} />
          <p style={{ fontSize: '14px', fontWeight: 500 }}>No words pending review.</p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', maxWidth: '260px', margin: '6px auto 0 auto' }}>
            Tap "Sync Doc" to fetch and AI-parse your tutor's latest vocabulary.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {Object.entries(pendingStore)
            .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
            .map(([dateStr, lesson]) => {
              const lowCount = lesson.items.filter(i => i.confidence === 'low').length;
              return (
                <div
                  key={dateStr}
                  onClick={() => { setReviewLesson(dateStr); setEditingItem(null); }}
                  className="tap-active"
                  style={{
                    padding: '16px', borderRadius: 'var(--radius-lg)', cursor: 'pointer',
                    border: `1px solid ${lowCount > 0 ? 'var(--accent)' : 'var(--border)'}`,
                    backgroundColor: 'var(--bg-surface)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '15px', fontWeight: 600 }}>
                      {new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{lesson.items.length} words</span>
                      {lowCount > 0 && (
                        <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>⚠ {lowCount} need attention</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
