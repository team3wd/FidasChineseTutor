// App shell — shared state, header, bottom nav, and tab routing

'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BookOpen, Layers, Gamepad2, BarChart3, RefreshCw, AlertCircle, X, ClipboardCheck, LogOut, User } from 'lucide-react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { Lesson, VocabItem, LocalStudyProgress } from '@/lib/types';
import { loadPending, savePending, PendingStore, totalPendingCount } from '@/lib/pending';
import { supabase } from '@/lib/supabase';
import { loadProgressFromSupabase, upsertProgressEntry, syncLocalToSupabase } from '@/lib/progressSync';
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
  const mainRef = useRef<HTMLElement>(null);
  const [pendingStore, setPendingStore] = useState<PendingStore>({});
  const [parsing, setParsing] = useState(false);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [vocabulary, setVocabulary] = useState<VocabItem[]>([]);
  const [studyProgress, setStudyProgress] = useState<LocalStudyProgress>({});
  const [syncStatus, setSyncStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [appMode, setAppMode] = useState<'local' | 'supabase'>('local');
  const [parseLog, setParseLog] = useState<{ date: string; status: 'parsing' | 'done'; words: number }[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // Auth state
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginSent, setLoginSent] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [showLoginPanel, setShowLoginPanel] = useState(false);

  // Load local data on mount
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

  // Subscribe to Supabase auth state
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // On login: load progress from Supabase and merge with local
  useEffect(() => {
    if (!user) return;

    setAppMode('supabase');
    localStorage.setItem('ch_mode', 'supabase');

    (async () => {
      const localRaw = localStorage.getItem('ch_progress');
      const localProgress: LocalStudyProgress = localRaw ? JSON.parse(localRaw) : {};
      const remoteProgress = await loadProgressFromSupabase(user.id);
      const merged = await syncLocalToSupabase(user.id, localProgress, remoteProgress);
      setStudyProgress(merged);
      localStorage.setItem('ch_progress', JSON.stringify(merged));
    })();
  }, [user]);

  const saveLocalData = useCallback((
    newLessons: Lesson[],
    newVocab: VocabItem[],
    newProgress: LocalStudyProgress,
    changedHanzi?: string
  ) => {
    setLessons(newLessons);
    setVocabulary(newVocab);
    setStudyProgress(newProgress);
    localStorage.setItem('ch_lessons', JSON.stringify(newLessons));
    localStorage.setItem('ch_vocabulary', JSON.stringify(newVocab));
    localStorage.setItem('ch_progress', JSON.stringify(newProgress));

    // Sync the changed entry to Supabase if logged in
    if (user && changedHanzi && newProgress[changedHanzi]) {
      upsertProgressEntry(user.id, changedHanzi, newProgress[changedHanzi]);
    }
  }, [user]);

  const speakHanzi = (hanzi: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(hanzi);
    utterance.lang = 'zh-CN';
    window.speechSynthesis.speak(utterance);
  };

  const handleSync = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setParsing(true);
    setSyncStatus(null);
    setParseLog([]);

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
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({}));
        setSyncStatus({ success: false, message: errData.error || `Server error ${res.status}` });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let lessonsParsed = 0;
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event: any;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }

          if (event.type === 'parsing') {
            setParseLog(prev => [...prev, { date: event.date, status: 'parsing', words: 0 }]);
          } else if (event.type === 'lesson') {
            const words = (event.items as any[]).length;
            lessonsParsed++;
            const current = loadPending();
            current[event.date] = { date: event.date, rawLineCount: event.rawLineCount, items: event.items };
            savePending(current);
            setPendingStore({ ...current });
            setParseLog(prev =>
              prev.map(e => e.date === event.date ? { ...e, status: 'done', words } : e)
            );
          } else if (event.type === 'done') {
            if (lessonsParsed === 0) {
              setSyncStatus({ success: true, message: event.message || 'All lessons are already up to date!' });
            } else {
              const current = loadPending();
              setSyncStatus({
                success: true,
                message: `AI parsed ${lessonsParsed} new lessons → ${totalPendingCount(current)} words ready for review!`,
              });
              setActiveTab('review');
            }
            streamDone = true;
            break;
          } else if (event.type === 'error') {
            setSyncStatus({ success: false, message: event.message });
            streamDone = true;
            break;
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setSyncStatus({ success: false, message: 'Network error during AI parse.' });
      } else {
        const current = loadPending();
        const count = totalPendingCount(current);
        setSyncStatus({
          success: count > 0,
          message: count > 0
            ? `Stopped — ${count} words saved. Sync again to continue where you left off.`
            : 'Stopped before any lessons were saved.',
        });
      }
    } finally {
      setParsing(false);
      abortRef.current = null;
    }
  };

  const handleSendMagicLink = async () => {
    if (!loginEmail.trim()) return;
    setLoginLoading(true);
    setLoginError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: loginEmail.trim(),
      options: { emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
    });
    setLoginLoading(false);
    if (error) {
      setLoginError(error.message);
    } else {
      setLoginSent(true);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAppMode('local');
    localStorage.setItem('ch_mode', 'local');
    setShowLoginPanel(false);
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
            {authLoading ? 'Loading…' : user ? `Synced · ${user.email}` : 'Guest Mode (Browser Storage)'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Auth button */}
          {!authLoading && (
            <button
              onClick={() => user ? handleLogout() : setShowLoginPanel(v => !v)}
              className="tap-active"
              style={{
                padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-app)', display: 'flex', alignItems: 'center', gap: '5px',
                fontSize: '12px', fontWeight: 500, color: user ? 'var(--text-secondary)' : 'var(--primary)',
                transition: 'all var(--transition-fast)'
              }}
            >
              {user ? <LogOut size={13} /> : <User size={13} />}
              {user ? 'Sign out' : 'Sign in'}
            </button>
          )}
          {/* Sync button */}
          <button
            onClick={parsing ? () => abortRef.current?.abort() : handleSync}
            className="tap-active"
            style={{
              padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
              backgroundColor: parsing ? 'var(--danger-subtle)' : 'var(--bg-app)',
              display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '12px', fontWeight: 500,
              color: parsing ? 'var(--danger)' : 'var(--text-primary)',
              transition: 'all var(--transition-fast)'
            }}
          >
            <RefreshCw size={14} style={{ animation: parsing ? 'spin 1s linear infinite' : 'none' }} />
            {parsing ? 'Stop' : 'Sync Doc'}
          </button>
        </div>
      </header>

      {/* Login panel */}
      {showLoginPanel && !user && (
        <div style={{
          margin: '12px 16px 0 16px', padding: '16px', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)',
          animation: 'fadeIn var(--transition-fast) forwards'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>Sign in to sync progress</span>
            <button aria-label="Close" onClick={() => { setShowLoginPanel(false); setLoginSent(false); setLoginError(null); }}>
              <X size={14} style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>
          {loginSent ? (
            <p style={{ fontSize: '13px', color: 'var(--success)', lineHeight: 1.5 }}>
              Magic link sent! Check your email and click the link to sign in.
            </p>
          ) : (
            <>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.5 }}>
                Enter your email. We'll send a one-click sign-in link — no password needed.
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendMagicLink()}
                  style={{
                    flex: 1, padding: '8px 10px', borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)', fontSize: '13px',
                    backgroundColor: 'var(--bg-app)', color: 'var(--text-primary)', outline: 'none'
                  }}
                />
                <button
                  onClick={handleSendMagicLink}
                  disabled={loginLoading || !loginEmail.trim()}
                  className="tap-active"
                  style={{
                    padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--primary)', color: '#fff',
                    fontSize: '12px', fontWeight: 600, border: 'none',
                    opacity: loginLoading || !loginEmail.trim() ? 0.6 : 1
                  }}
                >
                  {loginLoading ? '…' : 'Send'}
                </button>
              </div>
              {loginError && (
                <p style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '8px' }}>{loginError}</p>
              )}
            </>
          )}
        </div>
      )}

      {parsing && (
        <div style={{
          margin: '12px 16px 0 16px', padding: '12px', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)', fontSize: '12px',
        }}>
          <div style={{ fontWeight: 500, color: 'var(--text-secondary)', marginBottom: parseLog.length > 0 ? '8px' : 0 }}>
            {parseLog.length === 0
              ? 'Fetching Google Doc…'
              : `Parsing lessons… (${parseLog.filter(e => e.status === 'done').length} / ${parseLog.length} done)`}
          </div>
          {parseLog.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '140px', overflowY: 'auto' }}>
              {parseLog.map(entry => (
                <div key={entry.date} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'monospace', fontSize: '11px' }}>
                  <span style={{ width: '12px', color: entry.status === 'done' ? 'var(--success)' : 'var(--text-muted)' }}>
                    {entry.status === 'done' ? '✓' : '…'}
                  </span>
                  <span style={{ color: 'var(--text-primary)' }}>{entry.date}</span>
                  {entry.status === 'done' && (
                    <span style={{ color: 'var(--text-muted)' }}>— {entry.words} words</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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

      <main ref={mainRef} style={{ flex: 1, padding: '16px 16px 80px 16px', overflowY: 'auto' }}>
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
        {activeTab === 'review' && (
          <ReviewTab
            pendingStore={pendingStore} onPendingUpdate={setPendingStore}
            lessons={lessons} vocabulary={vocabulary}
            studyProgress={studyProgress} onSave={saveLocalData} speakHanzi={speakHanzi}
          />
        )}
      </main>

      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: '480px', margin: '0 auto',
        height: '60px', backgroundColor: 'var(--bg-surface)', borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        paddingBottom: 'env(safe-area-inset-bottom)', zIndex: 50
      }}>
        {tabNavItems.map(({ id, label, icon, badge }) => (
          <button
            key={id}
            onClick={() => { setActiveTab(id); mainRef.current?.scrollTo(0, 0); }}
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
