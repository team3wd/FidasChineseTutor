// App shell — shared state, header, bottom nav, and tab routing

'use client';

import React, { useState, useEffect } from 'react';
import { BookOpen, Layers, Gamepad2, BarChart3, RefreshCw, AlertCircle, X, ClipboardCheck } from 'lucide-react';
import { Lesson, VocabItem, LocalStudyProgress } from '@/lib/types';
import { loadPending, savePending, PendingStore, totalPendingCount } from '@/lib/pending';
import LessonsTab from '@/components/tabs/LessonsTab';
import FlashcardsTab from '@/components/tabs/FlashcardsTab';
import PracticeTab from '@/components/tabs/PracticeTab';
import StatsTab from '@/components/tabs/StatsTab';
import ReviewTab from '@/components/tabs/ReviewTab';

// localStorage keys:
//   ch_lessons      — approved Lesson[] array
//   ch_vocabulary   — approved VocabItem[] array
//   ch_progress     — LocalStudyProgress object (keyed by hanzi)
//   ch_mode         — 'local' | 'supabase'
//   ch_study_dates  — string[] of toDateString() values for streak tracking
//   ch_pending      — PendingStore (AI-parsed vocab awaiting approval) — managed by src/lib/pending.ts

type Tab = 'lessons' | 'flashcards' | 'practice' | 'stats' | 'review';

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('lessons');
  const [pendingStore, setPendingStore] = useState<PendingStore>({});
  const [parsing, setParsing] = useState(false);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [vocabulary, setVocabulary] = useState<VocabItem[]>([]);
  const [studyProgress, setStudyProgress] = useState<LocalStudyProgress>({});
  const [syncStatus, setSyncStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [appMode, setAppMode] = useState<'local' | 'supabase'>('local');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedLessons = localStorage.getItem('ch_lessons');
    const storedVocab = localStorage.getItem('ch_vocabulary');
    const storedProgress = localStorage.getItem('ch_progress');
    const storedMode = localStorage.getItem('ch_mode');
    if (storedLessons) setLessons(JSON.parse(storedLessons));
    if (storedVocab) setVocabulary(JSON.parse(storedVocab));
    if (storedProgress) setStudyProgress(JSON.parse(storedProgress));
    if (storedMode) setAppMode(storedMode as 'local' | 'supabase');
    setPendingStore(loadPending());
  }, []);

  const saveLocalData = (newLessons: Lesson[], newVocab: VocabItem[], newProgress: LocalStudyProgress) => {
    setLessons(newLessons);
    setVocabulary(newVocab);
    setStudyProgress(newProgress);
    localStorage.setItem('ch_lessons', JSON.stringify(newLessons));
    localStorage.setItem('ch_vocabulary', JSON.stringify(newVocab));
    localStorage.setItem('ch_progress', JSON.stringify(newProgress));
  };

  const speakHanzi = (hanzi: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(hanzi);
    utterance.lang = 'zh-CN';
    window.speechSynthesis.speak(utterance);
  };

  const handleSync = async () => {
    setParsing(true);
    setSyncStatus(null);
    try {
      const approvedDates = Array.from(new Set([
        ...lessons.map(l => l.date),
        ...vocabulary.map(v => v.lesson_id.replace(/^l_/, ''))
      ])).filter(Boolean);
      const pendingDates = Object.keys(loadPending());
      const existingDates = Array.from(new Set([...approvedDates, ...pendingDates]));

      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ existingDates }),
      });

      if (!res.ok && res.headers.get('content-type')?.includes('application/json') === false) {
        setSyncStatus({ success: false, message: `Server error ${res.status} — check terminal logs for details.` });
        return;
      }

      const data = await res.json();

      if (data.success) {
        if (data.lessonsParsed === 0) {
          setSyncStatus({ success: true, message: data.message || 'All lessons are already up to date!' });
          return;
        }
        const current = loadPending();
        Object.entries(data.lessons as Record<string, any>).forEach(([dateStr, lesson]: any) => {
          current[dateStr] = { date: dateStr, rawLineCount: lesson.rawLineCount, items: lesson.items };
        });
        savePending(current);
        setPendingStore({ ...current });
        setSyncStatus({
          success: true,
          message: `AI parsed ${data.lessonsParsed} new lessons → ${totalPendingCount(current)} words ready for review!`,
        });
        setActiveTab('review');
      } else {
        setSyncStatus({ success: false, message: data.error || 'Parse failed.' });
      }
    } catch {
      setSyncStatus({ success: false, message: 'Network error during AI parse.' });
    } finally {
      setParsing(false);
    }
  };

  const tabNavItems: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'lessons', label: 'Lessons', icon: <BookOpen size={18} /> },
    { id: 'flashcards', label: 'Flashcards', icon: <Layers size={18} /> },
    { id: 'practice', label: 'Practice', icon: <Gamepad2 size={18} /> },
    { id: 'review', label: 'Review', icon: <ClipboardCheck size={18} />, badge: totalPendingCount(pendingStore) },
    { id: 'stats', label: 'Stats', icon: <BarChart3 size={18} /> },
  ];

  return (
    <div style={{
      maxWidth: '480px', margin: '0 auto', width: '100%', minHeight: '100vh',
      display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-app)', position: 'relative'
    }}>
      <header style={{
        padding: '18px 16px 12px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 50
      }}>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            Chinese Study Companion
          </h1>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
            {appMode === 'local' ? 'Guest Mode (Browser Storage)' : 'Cloud Mode (Supabase)'}
          </span>
        </div>
        <button
          onClick={handleSync}
          disabled={parsing}
          className="tap-active"
          style={{
            padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
            backgroundColor: 'var(--bg-app)', display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', transition: 'all var(--transition-fast)'
          }}
        >
          <RefreshCw size={14} style={{ animation: parsing ? 'spin 1s linear infinite' : 'none' }} />
          {parsing ? 'Parsing...' : 'Sync Doc'}
        </button>
      </header>

      {syncStatus && (
        <div style={{
          margin: '12px 16px 0 16px', padding: '12px', borderRadius: 'var(--radius-md)',
          backgroundColor: syncStatus.success ? 'var(--success-subtle)' : 'var(--danger-subtle)',
          border: `1px solid ${syncStatus.success ? 'var(--success)' : 'var(--danger)'}`,
          display: 'flex', alignItems: 'start', gap: '8px', fontSize: '13px',
          color: syncStatus.success ? 'var(--success)' : 'var(--danger)',
          position: 'relative', animation: 'fadeIn var(--transition-fast) forwards'
        }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ flex: 1, paddingRight: '16px' }}>{syncStatus.message}</div>
          <button onClick={() => setSyncStatus(null)} style={{ position: 'absolute', right: '8px', top: '8px', opacity: 0.7 }}>
            <X size={14} />
          </button>
        </div>
      )}

      <main style={{ flex: 1, padding: '16px 16px 80px 16px', overflowY: 'auto' }}>
        {activeTab === 'lessons' && (
          <LessonsTab lessons={lessons} vocabulary={vocabulary} speakHanzi={speakHanzi} />
        )}
        {activeTab === 'flashcards' && (
          <FlashcardsTab
            vocabulary={vocabulary} lessons={lessons}
            studyProgress={studyProgress} onSave={saveLocalData} speakHanzi={speakHanzi}
          />
        )}
        {activeTab === 'practice' && (
          <PracticeTab
            vocabulary={vocabulary} lessons={lessons}
            studyProgress={studyProgress} onSave={saveLocalData} speakHanzi={speakHanzi}
          />
        )}
        {activeTab === 'stats' && (
          <StatsTab vocabulary={vocabulary} studyProgress={studyProgress} />
        )}
      </main>

      {activeTab === 'review' && (
        <ReviewTab
          pendingStore={pendingStore} onPendingUpdate={setPendingStore}
          lessons={lessons} vocabulary={vocabulary}
          studyProgress={studyProgress} onSave={saveLocalData} speakHanzi={speakHanzi}
        />
      )}

      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: '480px', margin: '0 auto',
        height: '60px', backgroundColor: 'var(--bg-surface)', borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        paddingBottom: 'env(safe-area-inset-bottom)', zIndex: 50
      }}>
        {tabNavItems.map(({ id, label, icon, badge }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
              fontSize: '10px', fontWeight: activeTab === id ? 600 : 500,
              color: activeTab === id ? 'var(--primary)' : 'var(--text-secondary)',
              transition: 'color var(--transition-fast)', position: 'relative'
            }}
          >
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              {icon}
              {badge != null && badge > 0 && (
                <span style={{
                  position: 'absolute', top: '-5px', right: '-8px',
                  backgroundColor: 'var(--accent)', color: '#fff',
                  borderRadius: '99px', fontSize: '8px', fontWeight: 700,
                  padding: '1px 4px', lineHeight: 1.4, minWidth: '14px', textAlign: 'center'
                }}>
                  {badge}
                </span>
              )}
            </span>
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
