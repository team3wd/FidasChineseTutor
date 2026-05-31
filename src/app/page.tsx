'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  BookOpen, 
  Layers, 
  Gamepad2, 
  BarChart3, 
  RefreshCw, 
  Volume2, 
  Check, 
  X, 
  ChevronRight, 
  BookMarked,
  Award,
  Flame,
  AlertCircle,
  ClipboardCheck,
  Pencil
} from 'lucide-react';
import { calculateSRS, SRSState } from '@/lib/srs';
import {
  PendingStore,
  PendingVocabItem,
  PendingLesson,
  loadPending,
  savePending,
  clearPendingLesson,
  totalPendingCount,
} from '@/lib/pending';

// Types matching DB/Local schema
interface VocabItem {
  id: string;
  lesson_id: string;
  hanzi: string;
  pinyin: string;
  translation: string;
}

interface Lesson {
  id: string;
  date: string;
  context_text: string;
}

interface LocalStudyProgress {
  [vocabId: string]: {
    interval: number;
    easeFactor: number;
    repetitions: number;
    nextReview: string; // ISO string
    status: 'NEW' | 'LEARNING' | 'REVIEW' | 'MASTERED';
    incorrect_count: number;
  };
}

export default function Home() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<'lessons' | 'flashcards' | 'practice' | 'stats' | 'review'>('lessons');

  // Pending Review State
  const [pendingStore, setPendingStore] = useState<PendingStore>({});
  const [reviewLesson, setReviewLesson] = useState<string | null>(null); // date key
  const [editingItem, setEditingItem] = useState<string | null>(null);   // item id
  const [editHanzi, setEditHanzi] = useState('');
  const [editPinyin, setEditPinyin] = useState('');
  const [editTranslation, setEditTranslation] = useState('');
  const [parsing, setParsing] = useState(false);
  
  // Data State
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [vocabulary, setVocabulary] = useState<VocabItem[]>([]);
  const [studyProgress, setStudyProgress] = useState<LocalStudyProgress>({});
  
  // App UI State
  // parsing state now used instead of syncing
  const [syncStatus, setSyncStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [appMode, setAppMode] = useState<'local' | 'supabase'>('local');

  // Flashcards Study Session State
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<VocabItem[]>([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  const [reviewMode, setReviewMode] = useState<'due' | 'all'>('due');

  // Game 1: Tone Guessing State
  const [toneGameWord, setToneGameWord] = useState<VocabItem | null>(null);
  const [toneFeedback, setToneFeedback] = useState<{ isCorrect: boolean; selected: number } | null>(null);

  // Game 2: Multiple Choice Match State
  const [mcWord, setMcWord] = useState<VocabItem | null>(null);
  const [mcOptions, setMcOptions] = useState<string[]>([]);
  const [mcFeedback, setMcFeedback] = useState<{ isCorrect: boolean; selected: string } | null>(null);

  // Story Reader Helper
  const [activeTooltip, setActiveTooltip] = useState<{ hanzi: string; pinyin: string; translation: string } | null>(null);

  // Sound Pronunciation Helper (Web Speech API)
  const speakHanzi = (hanzi: string) => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      // Cancel ongoing speech
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(hanzi);
      utterance.lang = 'zh-CN';
      window.speechSynthesis.speak(utterance);
    }
  };

  // Load initial data from local storage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedLessons = localStorage.getItem('ch_lessons');
      const storedVocab = localStorage.getItem('ch_vocabulary');
      const storedProgress = localStorage.getItem('ch_progress');
      const storedMode = localStorage.getItem('ch_mode');

      if (storedLessons) setLessons(JSON.parse(storedLessons));
      if (storedVocab) setVocabulary(JSON.parse(storedVocab));
      if (storedProgress) setStudyProgress(JSON.parse(storedProgress));
      if (storedMode) setAppMode(storedMode as 'local' | 'supabase');

      // Load any pending review items
      setPendingStore(loadPending());
    }
  }, []);

  // Set up Game 1: Tone Guessing Word
  useEffect(() => {
    if (vocabulary.length > 0 && activeTab === 'practice' && !toneGameWord) {
      pickNewToneWord();
    }
  }, [vocabulary, activeTab, toneGameWord]);

  // Set up Game 2: Multiple Choice Word
  useEffect(() => {
    if (vocabulary.length > 0 && activeTab === 'practice' && !mcWord) {
      pickNewMcWord();
    }
  }, [vocabulary, activeTab, mcWord]);

  // Build Study Session Review Queue
  useEffect(() => {
    if (vocabulary.length > 0 && activeTab === 'flashcards') {
      buildReviewQueue();
    }
  }, [vocabulary, studyProgress, activeTab, reviewMode]);

  // Save changes to LocalStorage helper
  const saveLocalData = (newLessons: Lesson[], newVocab: VocabItem[], newProgress: LocalStudyProgress) => {
    setLessons(newLessons);
    setVocabulary(newVocab);
    setStudyProgress(newProgress);

    localStorage.setItem('ch_lessons', JSON.stringify(newLessons));
    localStorage.setItem('ch_vocabulary', JSON.stringify(newVocab));
    localStorage.setItem('ch_progress', JSON.stringify(newProgress));
  };

  // Trigger AI-powered Google Doc parse → fills Review queue
  const handleSync = async () => {
    setParsing(true);
    setSyncStatus(null);
    try {
      // Get all dates already in vocab, lessons, or pending review
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
      const data = await res.json();

      if (data.success) {
        if (data.lessonsParsed === 0) {
          setSyncStatus({
            success: true,
            message: data.message || 'All lessons are already up to date!',
          });
          return;
        }

        // Merge new lessons into pending store (keep existing ones)
        const current = loadPending();
        Object.entries(data.lessons as Record<string, any>).forEach(([dateStr, lesson]: any) => {
          current[dateStr] = {
            date: dateStr,
            rawLineCount: lesson.rawLineCount,
            items: lesson.items,
          };
        });
        savePending(current);
        setPendingStore({ ...current });

        const total = totalPendingCount(current);
        setSyncStatus({
          success: true,
          message: `AI parsed ${data.lessonsParsed} new lessons → ${total} words ready for review!`,
        });
        // Navigate straight to Review tab
        setActiveTab('review');
        setReviewLesson(null);
      } else {
        setSyncStatus({ success: false, message: data.error || 'Parse failed.' });
      }
    } catch (err) {
      setSyncStatus({ success: false, message: 'Network error during AI parse.' });
    } finally {
      setParsing(false);
    }
  };

  // ── Review Tab Helpers ────────────────────────────────────────────────────

  /** Approve a single pending word → move it to vocabulary bank */
  const approvePendingItem = (dateStr: string, itemId: string) => {
    const store = loadPending();
    const lesson = store[dateStr];
    if (!lesson) return;

    const item = lesson.items.find((i) => i.id === itemId);
    if (!item) return;

    // Add to vocabulary bank
    const lessonId = `l_${dateStr}`;
    const newVocab: VocabItem = {
      id: `v_${itemId}`,
      lesson_id: lessonId,
      hanzi: item.hanzi,
      pinyin: item.pinyin,
      translation: item.translation,
    };

    // Ensure the lesson header exists
    const existingLessons = [...lessons];
    if (!existingLessons.find((l) => l.id === lessonId)) {
      existingLessons.unshift({ id: lessonId, date: dateStr, context_text: '' });
      existingLessons.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    const existingVocab = [...vocabulary];
    if (!existingVocab.find((v) => v.hanzi === item.hanzi && v.lesson_id === lessonId)) {
      existingVocab.push(newVocab);
    }

    const newProgress = { ...studyProgress };
    if (!newProgress[item.hanzi]) {
      newProgress[item.hanzi] = {
        interval: 0, easeFactor: 2.5, repetitions: 0,
        nextReview: new Date().toISOString(), status: 'NEW', incorrect_count: 0,
      };
    }

    saveLocalData(existingLessons, existingVocab, newProgress);

    // Remove item from pending
    store[dateStr].items = store[dateStr].items.filter((i) => i.id !== itemId);
    if (store[dateStr].items.length === 0) delete store[dateStr];
    savePending(store);
    setPendingStore({ ...store });
  };

  /** Approve ALL pending items in one lesson */
  const approveAllInLesson = (dateStr: string) => {
    const store = loadPending();
    const lesson = store[dateStr];
    if (!lesson) return;
    lesson.items.forEach((item) => approvePendingItem(dateStr, item.id));
  };

  /** Reject (delete) a single pending item */
  const rejectPendingItem = (dateStr: string, itemId: string) => {
    const store = loadPending();
    if (!store[dateStr]) return;
    store[dateStr].items = store[dateStr].items.filter((i) => i.id !== itemId);
    if (store[dateStr].items.length === 0) delete store[dateStr];
    savePending(store);
    setPendingStore({ ...store });
  };

  /** Save inline edits to a pending item */
  const saveItemEdit = (dateStr: string, itemId: string) => {
    const store = loadPending();
    const lesson = store[dateStr];
    if (!lesson) return;
    const item = lesson.items.find((i) => i.id === itemId);
    if (!item) return;
    item.hanzi = editHanzi;
    item.pinyin = editPinyin;
    item.translation = editTranslation;
    item.confidence = 'high'; // user reviewed = high confidence now
    savePending(store);
    setPendingStore({ ...store });
    setEditingItem(null);
  };

  // Build flashcards queue
  const buildReviewQueue = () => {
    const now = new Date();
    
    // Filter due vocabulary based on standard SuperMemo schedules
    const dueVocab = vocabulary.filter(v => {
      const prog = studyProgress[v.hanzi];
      if (!prog) return true; // Synced but never studied cards are due
      return new Date(prog.nextReview) <= now;
    });

    if (reviewMode === 'due') {
      // Sort so older reviews or new cards show first
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
      // Study all words (shuffled)
      const shuffled = [...vocabulary].sort(() => 0.5 - Math.random());
      setReviewQueue(shuffled);
    }
    
    setCurrentQueueIndex(0);
    setIsFlipped(false);
  };

  // Process spaced repetition grading
  const handleGradeSRS = (grade: number) => {
    if (reviewQueue.length === 0) return;
    const currentWord = reviewQueue[currentQueueIndex];
    
    const currentSRS: SRSState = studyProgress[currentWord.hanzi] || {
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0
    };

    const nextSRS = calculateSRS(grade, currentSRS);

    const updatedProgress = { ...studyProgress };
    updatedProgress[currentWord.hanzi] = {
      interval: nextSRS.interval,
      easeFactor: nextSRS.easeFactor,
      repetitions: nextSRS.repetitions,
      nextReview: nextSRS.nextReview.toISOString(),
      status: nextSRS.status,
      incorrect_count: (studyProgress[currentWord.hanzi]?.incorrect_count || 0) + (grade < 3 ? 1 : 0)
    };

    // Save study streaks
    const studyDates = JSON.parse(localStorage.getItem('ch_study_dates') || '[]');
    const todayStr = new Date().toDateString();
    if (!studyDates.includes(todayStr)) {
      studyDates.push(todayStr);
      localStorage.setItem('ch_study_dates', JSON.stringify(studyDates));
    }

    saveLocalData(lessons, vocabulary, updatedProgress);

    // Slide/Flip Transition
    setIsFlipped(false);
    setTimeout(() => {
      if (currentQueueIndex + 1 < reviewQueue.length) {
        setCurrentQueueIndex(currentQueueIndex + 1);
      } else {
        // Queue finished
        setReviewQueue([]);
      }
    }, 200);
  };

  // Practice Game 1 Helper: Pick a new word for Tone Guessing
  const pickNewToneWord = () => {
    if (vocabulary.length === 0) return;
    
    // Choose a word that actually has visible pinyin tone marks
    const eligible = vocabulary.filter(v => v.pinyin && /[āáǎàēéěèīíǐìōóǒòūúǔùüǘǚǜū]/i.test(v.pinyin));
    const pool = eligible.length > 0 ? eligible : vocabulary;
    const randomWord = pool[Math.floor(Math.random() * pool.length)];
    
    setToneGameWord(randomWord);
    setToneFeedback(null);
  };

  // Heuristic to get tone number from pinyin string
  const getToneNumber = (pinyin: string): number => {
    if (/[āēīōūǖ]/i.test(pinyin)) return 1;
    if (/[áéíóúǘ]/i.test(pinyin)) return 2;
    if (/[ǎěǐǒǔǚ]/i.test(pinyin)) return 3;
    if (/[àèìòùǜ]/i.test(pinyin)) return 4;
    return 5; // Neutral
  };

  const handleToneSelection = (toneNum: number) => {
    if (!toneGameWord || toneFeedback) return;
    const correctTone = getToneNumber(toneGameWord.pinyin);
    const isCorrect = toneNum === correctTone;

    // Track incorrect count in study progress for stats
    if (!isCorrect) {
      const updatedProgress = { ...studyProgress };
      if (updatedProgress[toneGameWord.hanzi]) {
        updatedProgress[toneGameWord.hanzi].incorrect_count += 1;
        saveLocalData(lessons, vocabulary, updatedProgress);
      }
    }

    setToneFeedback({ isCorrect, selected: toneNum });
  };

  // Practice Game 2 Helper: Pick a new word for Multiple Choice
  const pickNewMcWord = () => {
    if (vocabulary.length === 0) return;
    const randomWord = vocabulary[Math.floor(Math.random() * vocabulary.length)];
    
    // Collect 3 incorrect random translations
    const otherTranslations = vocabulary
      .filter(v => v.id !== randomWord.id)
      .map(v => v.translation)
      .filter((value, index, self) => self.indexOf(value) === index); // Unique values

    const shuffledOthers = otherTranslations.sort(() => 0.5 - Math.random()).slice(0, 3);
    const options = [randomWord.translation, ...shuffledOthers].sort(() => 0.5 - Math.random());

    setMcWord(randomWord);
    setMcOptions(options);
    setMcFeedback(null);
  };

  const handleMcSelection = (option: string) => {
    if (!mcWord || mcFeedback) return;
    const isCorrect = option === mcWord.translation;

    if (!isCorrect) {
      const updatedProgress = { ...studyProgress };
      if (updatedProgress[mcWord.hanzi]) {
        updatedProgress[mcWord.hanzi].incorrect_count += 1;
        saveLocalData(lessons, vocabulary, updatedProgress);
      }
    }

    setMcFeedback({ isCorrect, selected: option });
  };

  // Helper to calculate streaks
  const getStudyStreak = (): number => {
    if (typeof window === 'undefined') return 0;
    const studyDates = JSON.parse(localStorage.getItem('ch_study_dates') || '[]');
    if (studyDates.length === 0) return 0;

    let streak = 0;
    const checkDate = new Date();
    checkDate.setHours(0, 0, 0, 0);

    // If today or yesterday has study history, count streak backwards
    const todayStr = checkDate.toDateString();
    checkDate.setDate(checkDate.getDate() - 1);
    const yesterdayStr = checkDate.toDateString();

    if (!studyDates.includes(todayStr) && !studyDates.includes(yesterdayStr)) {
      return 0; // Streak broken
    }

    const testDate = new Date();
    testDate.setHours(0, 0, 0, 0);

    while (true) {
      if (studyDates.includes(testDate.toDateString())) {
        streak++;
        testDate.setDate(testDate.getDate() - 1);
      } else {
        break;
      }
    }

    return streak;
  };

  // Helper to split lesson text by known vocabulary and wrap them
  const renderInteractiveStory = (text: string) => {
    if (!text) return <p className="text-secondary italic">No context story provided for this lesson.</p>;

    // For a simple minimalist dictionary tooltip, we search for vocabulary matching in the text
    // We sort vocabs by length descending to match larger compound words first
    const sortedVocab = [...vocabulary].sort((a, b) => b.hanzi.length - a.hanzi.length);
    
    // Find vocabs present in the lesson story
    const foundVocabs = sortedVocab.filter(v => text.includes(v.hanzi));
    if (foundVocabs.length === 0) {
      return <p className="text-primary" style={{ lineHeight: '1.8', whiteSpace: 'pre-line' }}>{text}</p>;
    }

    // Split text by word bounds and render
    let renderedContent: React.ReactNode[] = [];
    let textIndex = 0;

    // Standard recursive scanning for rendering clickable spans
    const parts = text.split('\n\n');
    return (
      <div className="story-container" style={{ lineHeight: '1.8', whiteSpace: 'pre-line' }}>
        {parts.map((part, pIdx) => {
          let currentSegment = part;
          let segmentElements: React.ReactNode[] = [];
          let keyCounter = 0;

          // Search and isolate words in this paragraph
          while (currentSegment.length > 0) {
            let earliestMatch: { index: number; word: VocabItem } | null = null;

            for (const v of foundVocabs) {
              const idx = currentSegment.indexOf(v.hanzi);
              if (idx !== -1) {
                if (!earliestMatch || idx < earliestMatch.index) {
                  earliestMatch = { index: idx, word: v };
                }
              }
            }

            if (earliestMatch) {
              const { index, word } = earliestMatch;
              // Add leading normal text
              if (index > 0) {
                segmentElements.push(<span key={`txt-${keyCounter++}`}>{currentSegment.substring(0, index)}</span>);
              }
              // Add highlight word
              segmentElements.push(
                <span 
                  key={`wd-${keyCounter++}`} 
                  onClick={() => {
                    setActiveTooltip(word);
                    speakHanzi(word.hanzi);
                  }}
                  className="interactive-word"
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
              // Add remaining text
              segmentElements.push(<span key={`txt-${keyCounter++}`}>{currentSegment}</span>);
              break;
            }
          }

          return <p key={`p-${pIdx}`} style={{ marginBottom: '16px' }}>{segmentElements}</p>;
        })}
      </div>
    );
  };

  // Render Stats Breakdown Helpers
  const newCount = vocabulary.filter(v => !studyProgress[v.hanzi] || studyProgress[v.hanzi].status === 'NEW').length;
  const learningCount = vocabulary.filter(v => studyProgress[v.hanzi]?.status === 'LEARNING').length;
  const reviewCount = vocabulary.filter(v => studyProgress[v.hanzi]?.status === 'REVIEW').length;
  const masteredCount = vocabulary.filter(v => studyProgress[v.hanzi]?.status === 'MASTERED').length;

  const totalStudied = vocabulary.length - newCount;
  const masteryPercentage = vocabulary.length > 0 ? Math.round((masteredCount / vocabulary.length) * 100) : 0;

  // Get most difficult words
  const difficultWords = [...vocabulary]
    .filter(v => studyProgress[v.hanzi] && studyProgress[v.hanzi].incorrect_count > 0)
    .sort((a, b) => (studyProgress[b.hanzi]?.incorrect_count || 0) - (studyProgress[a.hanzi]?.incorrect_count || 0))
    .slice(0, 5);

  return (
    <div style={{
      maxWidth: '480px',
      margin: '0 auto',
      width: '100%',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'var(--bg-app)',
      position: 'relative'
    }}>
      
      {/* HEADER SECTION */}
      <header style={{
        padding: '18px 16px 12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'var(--bg-surface)',
        position: 'sticky',
        top: 0,
        zIndex: 50
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
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--bg-app)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            fontWeight: 500,
            color: 'var(--text-primary)',
            transition: 'all var(--transition-fast)'
          }}
        >
          <RefreshCw size={14} style={{
            animation: parsing ? 'spin 1s linear infinite' : 'none'
          }} />
          {parsing ? 'Parsing...' : 'Sync Doc'}
        </button>
      </header>

      {/* NOTIFICATIONS */}
      {syncStatus && (
        <div style={{
          margin: '12px 16px 0 16px',
          padding: '12px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: syncStatus.success ? 'var(--success-subtle)' : 'var(--danger-subtle)',
          border: `1px solid ${syncStatus.success ? 'var(--success)' : 'var(--danger)'}`,
          display: 'flex',
          alignItems: 'start',
          gap: '8px',
          fontSize: '13px',
          color: syncStatus.success ? 'var(--success)' : 'var(--danger)',
          position: 'relative',
          animation: 'fadeIn var(--transition-fast) forwards'
        }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ flex: 1, paddingRight: '16px' }}>{syncStatus.message}</div>
          <button 
            onClick={() => setSyncStatus(null)}
            style={{ position: 'absolute', right: '8px', top: '8px', opacity: 0.7 }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* CORE CONTENT TABS */}
      <main style={{ flex: 1, padding: '16px 16px 80px 16px', overflowY: 'auto' }}>
        
        {/* ==================== 1. LESSONS TAB ==================== */}
        {activeTab === 'lessons' && (
          <div className="animate-fade-in">
            {selectedLesson ? (
              // Selected Lesson View
              <div>
                <button 
                  onClick={() => {
                    setSelectedLesson(null);
                    setActiveTooltip(null);
                  }}
                  style={{
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
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

                {/* Vocabulary for this Lesson */}
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
                            <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {vocab.hanzi}
                            </span>
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                              {vocab.pinyin}
                            </span>
                          </div>
                          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            {vocab.translation}
                          </p>
                        </div>
                        <button 
                          onClick={() => speakHanzi(vocab.hanzi)}
                          className="tap-active"
                          style={{
                            padding: '8px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--bg-app)',
                            color: 'var(--text-secondary)'
                          }}
                        >
                          <Volume2 size={16} />
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            ) : (
              // Lessons List View
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '4px' }}>
                  Your Tutor Lessons
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                  Sync the Google Doc to pull new lessons twice a week. Tap a lesson to read.
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
                      Click the "Sync Doc" button at the top right to parse and download vocabulary from your teacher's public doc.
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
                            <span style={{
                              display: 'block',
                              fontSize: '11px',
                              color: 'var(--text-muted)',
                              marginTop: '4px'
                            }}>
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
          </div>
        )}

        {/* ==================== 2. FLASHCARDS TAB ==================== */}
        {activeTab === 'flashcards' && (
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
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-surface)',
                  fontSize: '12px',
                  fontWeight: 500,
                  outline: 'none'
                }}
              >
                <option value="due">Due Cards ({vocabulary.filter(v => {
                  const prog = studyProgress[v.hanzi];
                  return !prog || new Date(prog.nextReview) <= new Date();
                }).length})</option>
                <option value="all">All Words ({vocabulary.length})</option>
              </select>
            </div>

            {reviewQueue.length === 0 ? (
              <div style={{
                padding: '40px 20px',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border)',
                textAlign: 'center',
                backgroundColor: 'var(--bg-surface)',
                boxShadow: 'var(--shadow-sm)'
              }}>
                <Award size={36} style={{ color: 'var(--primary)', margin: '0 auto 12px auto' }} />
                <p style={{ fontSize: '14px', fontWeight: 600 }}>Your review stack is fully clear.</p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', maxWidth: '280px', margin: '6px auto 16px auto' }}>
                  You have studied all cards due for today. Keep up the high retention streak.
                </p>
                <button 
                  onClick={() => {
                    setReviewMode('all');
                    buildReviewQueue();
                  }}
                  className="tap-active"
                  style={{
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    fontSize: '12px',
                    fontWeight: 500,
                    backgroundColor: 'var(--bg-app)'
                  }}
                >
                  Review all cards anyway
                </button>
              </div>
            ) : (
              <div>
                {/* Review Progress Indicator */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '14px',
                  fontSize: '12px',
                  color: 'var(--text-secondary)'
                }}>
                  <span>Card {currentQueueIndex + 1} of {reviewQueue.length}</span>
                  <span>{Math.round(((currentQueueIndex) / reviewQueue.length) * 100)}% complete</span>
                </div>
                
                <div style={{
                  width: '100%',
                  height: '4px',
                  borderRadius: '2px',
                  backgroundColor: 'var(--border)',
                  marginBottom: '24px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${((currentQueueIndex) / reviewQueue.length) * 100}%`,
                    height: '100%',
                    backgroundColor: 'var(--primary)',
                    transition: 'width var(--transition-fast)'
                  }} />
                </div>

                {/* The 3D CSS Flipping Card */}
                <div 
                  className={`flip-container ${isFlipped ? 'flipped' : ''}`}
                  onClick={() => {
                    setIsFlipped(!isFlipped);
                    if (!isFlipped) {
                      speakHanzi(reviewQueue[currentQueueIndex].hanzi);
                    }
                  }}
                >
                  <div className="flip-card-inner">
                    
                    {/* Card Front (Characters) */}
                    <div className="flip-card-front">
                      <span style={{ fontSize: '48px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {reviewQueue[currentQueueIndex].hanzi}
                      </span>
                      <span style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        marginTop: '28px',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase'
                      }}>
                        Tap to reveal
                      </span>
                    </div>

                    {/* Card Back (Pinyin & Definition) */}
                    <div className="flip-card-back">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          speakHanzi(reviewQueue[currentQueueIndex].hanzi);
                        }}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border)',
                          backgroundColor: 'var(--bg-app)',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: 'var(--text-secondary)',
                          marginBottom: '16px'
                        }}
                      >
                        <Volume2 size={14} /> Pronounce
                      </button>

                      <span style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {reviewQueue[currentQueueIndex].hanzi}
                      </span>
                      
                      <span style={{ 
                        fontSize: '18px', 
                        fontStyle: 'italic', 
                        color: 'var(--text-secondary)',
                        marginTop: '4px',
                        fontWeight: 500
                      }}>
                        {reviewQueue[currentQueueIndex].pinyin}
                      </span>
                      
                      <span style={{ 
                        fontSize: '15px', 
                        color: 'var(--text-muted)', 
                        marginTop: '16px',
                        maxWidth: '240px',
                        lineHeight: 1.4
                      }}>
                        {reviewQueue[currentQueueIndex].translation}
                      </span>
                    </div>

                  </div>
                </div>

                {/* SRS Confidence Feedback Options (Flipped only) */}
                {isFlipped ? (
                  <div className="animate-fade-in" style={{ marginTop: '24px' }}>
                    <p style={{
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      textAlign: 'center',
                      marginBottom: '12px',
                      fontWeight: 500
                    }}>
                      How well did you remember this card?
                    </p>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                      {[1, 2, 3, 4, 5].map(grade => {
                        const gradeLabels = ['Forgot', 'Failed', 'Hard', 'Good', 'Easy'];
                        const gradeColors = ['#ef4444', '#f97316', '#eab308', '#3b82f6', '#10b981'];
                        return (
                          <button
                            key={grade}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleGradeSRS(grade);
                            }}
                            className="tap-active"
                            style={{
                              padding: '10px 4px',
                              borderRadius: 'var(--radius-md)',
                              border: '1px solid var(--border)',
                              backgroundColor: 'var(--bg-surface)',
                              fontSize: '11px',
                              fontWeight: 600,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <span style={{ 
                              color: gradeColors[grade - 1], 
                              fontSize: '15px', 
                              fontWeight: 700 
                            }}>{grade}</span>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '9px' }}>
                              {gradeLabels[grade - 1]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p style={{
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    textAlign: 'center',
                    marginTop: '24px',
                    fontStyle: 'italic'
                  }}>
                    Tip: Read the Hanzi aloud, guess the meaning, then tap to check.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ==================== 3. PRACTICE TAB (GAMES) ==================== */}
        {activeTab === 'practice' && (
          <div className="animate-fade-in">
            <h2 style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '4px' }}>
              Practice Games
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Choose a quick-fire training game to strengthen tone recognition and vocabulary matching.
            </p>

            {vocabulary.length < 5 ? (
              <div style={{
                padding: '40px 20px',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border)',
                textAlign: 'center',
                backgroundColor: 'var(--bg-surface)'
              }}>
                <AlertCircle size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 12px auto' }} />
                <p style={{ fontSize: '14px', fontWeight: 500 }}>Not enough vocabulary loaded.</p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                  Please sync at least 5 words from the Google Doc to unlock active training games.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                
                {/* GAME 1: TONE GUESSING */}
                <div style={{
                  padding: '20px',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-surface)',
                  boxShadow: 'var(--shadow-sm)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--primary-subtle)',
                      color: 'var(--primary)',
                      fontSize: '11px',
                      fontWeight: 600
                    }}>Game 1</span>
                    <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Mandarin Tone Practice</h3>
                  </div>

                  {toneGameWord && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ 
                        fontSize: '36px', 
                        fontWeight: 700, 
                        color: 'var(--text-primary)',
                        marginBottom: '4px'
                      }}>
                        {toneGameWord.hanzi}
                      </div>
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                        {toneGameWord.translation}
                      </p>

                      {/* Tone selection buttons */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', marginBottom: '16px' }}>
                        {[1, 2, 3, 4, 5].map(tNum => {
                          const toneSymbols = ['¯ (1)', '´ (2)', 'ˇ (3)', '` (4)', '· (5)'];
                          const isCorrect = tNum === getToneNumber(toneGameWord.pinyin);
                          const isSelected = toneFeedback?.selected === tNum;
                          
                          let btnBg = 'var(--bg-app)';
                          let btnBorder = 'var(--border)';
                          let btnTextColor = 'var(--text-primary)';

                          if (toneFeedback) {
                            if (isCorrect) {
                              btnBg = 'var(--success-subtle)';
                              btnBorder = 'var(--success)';
                              btnTextColor = 'var(--success)';
                            } else if (isSelected) {
                              btnBg = 'var(--danger-subtle)';
                              btnBorder = 'var(--danger)';
                              btnTextColor = 'var(--danger)';
                            }
                          }

                          return (
                            <button
                              key={tNum}
                              disabled={!!toneFeedback}
                              onClick={() => handleToneSelection(tNum)}
                              className="tap-active"
                              style={{
                                padding: '12px 2px',
                                borderRadius: 'var(--radius-md)',
                                border: `1px solid ${btnBorder}`,
                                backgroundColor: btnBg,
                                color: btnTextColor,
                                fontSize: '11px',
                                fontWeight: 600
                              }}
                            >
                              {toneSymbols[tNum - 1]}
                            </button>
                          );
                        })}
                      </div>

                      {/* Game Feedback Section */}
                      {toneFeedback ? (
                        <div className="animate-fade-in" style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexDirection: 'column',
                          gap: '10px'
                        }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '13px',
                            fontWeight: 600,
                            color: toneFeedback.isCorrect ? 'var(--success)' : 'var(--danger)'
                          }}>
                            {toneFeedback.isCorrect ? (
                              <><Check size={16} /> Perfect! Pronounced: {toneGameWord.pinyin}</>
                            ) : (
                              <><X size={16} /> Incorrect. It is {toneGameWord.pinyin}</>
                            )}
                          </div>
                          
                          <button
                            onClick={() => speakHanzi(toneGameWord.hanzi)}
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-secondary)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              textDecoration: 'underline'
                            }}
                          >
                            <Volume2 size={12} /> Listen
                          </button>

                          <button
                            onClick={pickNewToneWord}
                            className="tap-active"
                            style={{
                              marginTop: '6px',
                              padding: '8px 16px',
                              borderRadius: 'var(--radius-md)',
                              backgroundColor: 'var(--text-primary)',
                              color: 'var(--bg-surface)',
                              fontSize: '12px',
                              fontWeight: 600
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
                  padding: '20px',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-surface)',
                  boxShadow: 'var(--shadow-sm)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--primary-subtle)',
                      color: 'var(--primary)',
                      fontSize: '11px',
                      fontWeight: 600
                    }}>Game 2</span>
                    <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Multiple Choice Match</h3>
                  </div>

                  {mcWord && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ 
                        fontSize: '36px', 
                        fontWeight: 700, 
                        color: 'var(--text-primary)',
                        marginBottom: '4px'
                      }}>
                        {mcWord.hanzi}
                      </div>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: '16px' }}>
                        {mcWord.pinyin}
                      </p>

                      {/* Options stack */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                        {mcOptions.map((opt, oIdx) => {
                          const isCorrect = opt === mcWord.translation;
                          const isSelected = mcFeedback?.selected === opt;

                          let btnBg = 'var(--bg-app)';
                          let btnBorder = 'var(--border)';
                          let btnTextColor = 'var(--text-primary)';

                          if (mcFeedback) {
                            if (isCorrect) {
                              btnBg = 'var(--success-subtle)';
                              btnBorder = 'var(--success)';
                              btnTextColor = 'var(--success)';
                            } else if (isSelected) {
                              btnBg = 'var(--danger-subtle)';
                              btnBorder = 'var(--danger)';
                              btnTextColor = 'var(--danger)';
                            }
                          }

                          return (
                            <button
                              key={oIdx}
                              disabled={!!mcFeedback}
                              onClick={() => handleMcSelection(opt)}
                              className="tap-active"
                              style={{
                                padding: '12px 16px',
                                borderRadius: 'var(--radius-md)',
                                border: `1px solid ${btnBorder}`,
                                backgroundColor: btnBg,
                                color: btnTextColor,
                                fontSize: '13px',
                                fontWeight: 500,
                                textAlign: 'left',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                              }}
                            >
                              <span>{opt}</span>
                              {mcFeedback && isCorrect && <Check size={14} />}
                              {mcFeedback && isSelected && !isCorrect && <X size={14} />}
                            </button>
                          );
                        })}
                      </div>

                      {/* Feedback action */}
                      {mcFeedback ? (
                        <div className="animate-fade-in">
                          <p style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: mcFeedback.isCorrect ? 'var(--success)' : 'var(--danger)',
                            marginBottom: '10px'
                          }}>
                            {mcFeedback.isCorrect ? 'Excellent! That is correct.' : `Incorrect. Correct: "${mcWord.translation}"`}
                          </p>

                          <button
                            onClick={pickNewMcWord}
                            className="tap-active"
                            style={{
                              padding: '8px 16px',
                              borderRadius: 'var(--radius-md)',
                              backgroundColor: 'var(--text-primary)',
                              color: 'var(--bg-surface)',
                              fontSize: '12px',
                              fontWeight: 600
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
            )}
          </div>
        )}

        {/* ==================== 4. STATISTICS TAB ==================== */}
        {activeTab === 'stats' && (
          <div className="animate-fade-in">
            <h2 style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '4px' }}>
              Study Progress Summary
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Tracks memory scheduling indices, streaks, and difficult vocabulary.
            </p>

            {/* Streak & Volume Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
              
              <div style={{
                padding: '16px',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-surface)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <div style={{
                  padding: '10px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--danger-subtle)',
                  color: 'var(--accent)'
                }}>
                  <Flame size={20} />
                </div>
                <div>
                  <span style={{ fontSize: '20px', fontWeight: 700, display: 'block' }}>
                    {getStudyStreak()} Days
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                    Active Streak
                  </span>
                </div>
              </div>

              <div style={{
                padding: '16px',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-surface)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <div style={{
                  padding: '10px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--primary-subtle)',
                  color: 'var(--primary)'
                }}>
                  <BookOpen size={20} />
                </div>
                <div>
                  <span style={{ fontSize: '20px', fontWeight: 700, display: 'block' }}>
                    {totalStudied} / {vocabulary.length}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                    Words Studied
                  </span>
                </div>
              </div>

            </div>

            {/* Mastery breakdown dashboard */}
            <div style={{
              padding: '20px',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-surface)',
              marginBottom: '20px',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '14px' }}>
                Retention Level Distribution
              </h3>

              {/* Progress visual block */}
              <div style={{
                display: 'flex',
                height: '16px',
                borderRadius: '8px',
                overflow: 'hidden',
                backgroundColor: 'var(--bg-app)',
                marginBottom: '20px'
              }}>
                <div style={{ width: `${vocabulary.length > 0 ? (masteredCount / vocabulary.length) * 100 : 0}%`, backgroundColor: '#10b981' }} title="Mastered" />
                <div style={{ width: `${vocabulary.length > 0 ? (reviewCount / vocabulary.length) * 100 : 0}%`, backgroundColor: '#3b82f6' }} title="Review" />
                <div style={{ width: `${vocabulary.length > 0 ? (learningCount / vocabulary.length) * 100 : 0}%`, backgroundColor: '#eab308' }} title="Learning" />
                <div style={{ width: `${vocabulary.length > 0 ? (newCount / vocabulary.length) * 100 : 0}%`, backgroundColor: 'var(--border)' }} title="New" />
              </div>

              {/* Legend with exact numbers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                  <span>Mastered ({masteredCount})</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#3b82f6' }} />
                  <span>Reviewing ({reviewCount})</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#eab308' }} />
                  <span>Learning ({learningCount})</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--border)' }} />
                  <span>Unstudied ({newCount})</span>
                </div>
              </div>
            </div>

            {/* List of highly difficult cards */}
            <div style={{
              padding: '20px',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-surface)'
            }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>
                Target Review: Toughest Words
              </h3>

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
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: 'var(--bg-app)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '13px'
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{word.hanzi}</span>
                        <span style={{ color: 'var(--text-secondary)', marginLeft: '6px', fontSize: '11px' }}>
                          ({word.pinyin})
                        </span>
                      </div>
                      <span style={{
                        fontSize: '11px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: 'var(--danger-subtle)',
                        color: 'var(--danger)',
                        fontWeight: 600
                      }}>
                        {studyProgress[word.hanzi]?.incorrect_count} Failed guesses
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

      </main>

      {/* FLOATING TEXT DICTIONARY TOOLTIP MODAL */}
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
              <span style={{ fontSize: '13px', fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                {activeTooltip.pinyin}
              </span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {activeTooltip.translation}
            </p>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={() => speakHanzi(activeTooltip.hanzi)}
              className="tap-active"
              style={{
                padding: '8px',
                borderRadius: '50%',
                backgroundColor: 'var(--bg-app)',
                color: 'var(--text-secondary)'
              }}
            >
              <Volume2 size={16} />
            </button>
            <button 
              onClick={() => setActiveTooltip(null)}
              style={{
                padding: '8px',
                borderRadius: '50%',
                color: 'var(--text-muted)'
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}


      {/* ==================== 5. REVIEW TAB ==================== */}
      {activeTab === 'review' && (
        <div className="animate-fade-in" style={{ padding: '16px 16px 80px 16px' }}>
          {reviewLesson ? (() => {
            const lesson = pendingStore[reviewLesson];
            if (!lesson) return null;
            return (
              <div>
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
                  {lesson.items.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: '14px',
                        borderRadius: 'var(--radius-md)',
                        border: `1px solid ${item.confidence === 'low' ? 'var(--accent)' : 'var(--border)'}`,
                        backgroundColor: item.confidence === 'low' ? 'rgba(217,119,6,0.06)' : 'var(--bg-surface)',
                      }}
                    >
                      {editingItem === item.id ? (
                        // ── Inline Edit Mode ──
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {(['Hanzi', 'Pinyin', 'Translation'] as const).map((field) => {
                            const val = field === 'Hanzi' ? editHanzi : field === 'Pinyin' ? editPinyin : editTranslation;
                            const setter = field === 'Hanzi' ? setEditHanzi : field === 'Pinyin' ? setEditPinyin : setEditTranslation;
                            return (
                              <div key={field}>
                                <label style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{field}</label>
                                <input
                                  value={val}
                                  onChange={(e) => setter(e.target.value)}
                                  style={{
                                    display: 'block', width: '100%', marginTop: '4px',
                                    padding: '8px 10px', borderRadius: 'var(--radius-sm)',
                                    border: '1px solid var(--border-focus)',
                                    backgroundColor: 'var(--bg-app)',
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
                        // ── Display Mode ──
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

                          {/* Action buttons */}
                          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                            <button
                              onClick={() => speakHanzi(item.hanzi)}
                              className="tap-active"
                              style={{ padding: '7px', borderRadius: '50%', backgroundColor: 'var(--bg-app)', color: 'var(--text-secondary)' }}
                            >
                              <Volume2 size={14} />
                            </button>
                            <button
                              onClick={() => {
                                setEditingItem(item.id);
                                setEditHanzi(item.hanzi);
                                setEditPinyin(item.pinyin);
                                setEditTranslation(item.translation);
                              }}
                              className="tap-active"
                              style={{ padding: '7px', borderRadius: '50%', backgroundColor: 'var(--bg-app)', color: 'var(--text-secondary)' }}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => approvePendingItem(reviewLesson, item.id)}
                              className="tap-active"
                              style={{ padding: '7px', borderRadius: '50%', backgroundColor: 'var(--success-subtle)', color: 'var(--success)' }}
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => rejectPendingItem(reviewLesson, item.id)}
                              className="tap-active"
                              style={{ padding: '7px', borderRadius: '50%', backgroundColor: 'var(--danger-subtle)', color: 'var(--danger)' }}
                            >
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
          })() : (
            // ── Lesson List View ──
            <div>
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
                      const lowCount = lesson.items.filter((i) => i.confidence === 'low').length;
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
          )}
        </div>
      )}

      {/* BOTTOM TAB NAVIGATION */}
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        maxWidth: '480px',
        margin: '0 auto',
        height: '60px',
        backgroundColor: 'var(--bg-surface)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingBottom: 'env(safe-area-inset-bottom)',
        zIndex: 50
      }}>
        <button 
          onClick={() => {
            setActiveTab('lessons');
            setSelectedLesson(null);
            setActiveTooltip(null);
          }}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
            fontSize: '10px', fontWeight: activeTab === 'lessons' ? 600 : 500,
            color: activeTab === 'lessons' ? 'var(--primary)' : 'var(--text-secondary)',
            transition: 'color var(--transition-fast)'
          }}
        >
          <BookOpen size={18} />
          <span>Lessons</span>
        </button>

        <button 
          onClick={() => { setActiveTab('flashcards'); setActiveTooltip(null); buildReviewQueue(); }}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
            fontSize: '10px', fontWeight: activeTab === 'flashcards' ? 600 : 500,
            color: activeTab === 'flashcards' ? 'var(--primary)' : 'var(--text-secondary)',
            transition: 'color var(--transition-fast)'
          }}
        >
          <Layers size={18} />
          <span>Flashcards</span>
        </button>

        <button 
          onClick={() => { setActiveTab('practice'); setActiveTooltip(null); pickNewToneWord(); pickNewMcWord(); }}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
            fontSize: '10px', fontWeight: activeTab === 'practice' ? 600 : 500,
            color: activeTab === 'practice' ? 'var(--primary)' : 'var(--text-secondary)',
            transition: 'color var(--transition-fast)'
          }}
        >
          <Gamepad2 size={18} />
          <span>Practice</span>
        </button>

        {/* Review tab with live badge count */}
        <button 
          onClick={() => { setActiveTab('review'); setActiveTooltip(null); setReviewLesson(null); }}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
            fontSize: '10px', fontWeight: activeTab === 'review' ? 600 : 500,
            color: activeTab === 'review' ? 'var(--primary)' : 'var(--text-secondary)',
            transition: 'color var(--transition-fast)', position: 'relative'
          }}
        >
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <ClipboardCheck size={18} />
            {totalPendingCount(pendingStore) > 0 && (
              <span style={{
                position: 'absolute', top: '-5px', right: '-8px',
                backgroundColor: 'var(--accent)', color: '#fff',
                borderRadius: '99px', fontSize: '8px', fontWeight: 700,
                padding: '1px 4px', lineHeight: 1.4, minWidth: '14px', textAlign: 'center'
              }}>
                {totalPendingCount(pendingStore)}
              </span>
            )}
          </span>
          <span>Review</span>
        </button>

        <button 
          onClick={() => { setActiveTab('stats'); setActiveTooltip(null); }}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
            fontSize: '10px', fontWeight: activeTab === 'stats' ? 600 : 500,
            color: activeTab === 'stats' ? 'var(--primary)' : 'var(--text-secondary)',
            transition: 'color var(--transition-fast)'
          }}
        >
          <BarChart3 size={18} />
          <span>Stats</span>
        </button>
      </nav>

    </div>
  );
}

