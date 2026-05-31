// Fetches the shared Google Doc, diffs against cached snapshot, then streams AI-parsed
// vocabulary via SSE — Anthropic is only called for date sections not in the last snapshot.

import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const DOC_URL =
  process.env.NEXT_PUBLIC_GOOGLE_DOC_SYNC_URL ||
  'https://docs.google.com/document/d/1G-hYtWAY7cVasorrjrU_ZTeDiQNMERJlmbEfKl2UTN4/export?format=txt';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParsedVocabItem {
  hanzi: string;
  pinyin: string;
  translation: string;
  confidence: 'high' | 'low';
}

interface LessonRaw {
  date: string;
  lines: string[];
}

// ── System prompt (stable — cached across all lesson parses in one request) ───

const PARSER_SYSTEM = `You are a Chinese language tutor assistant. Extract vocabulary items from raw lesson notes.

A vocabulary item has three fields:
- hanzi: Chinese characters
- pinyin: romanised pronunciation (tone marks like ā á ǎ à, or tone numbers like a1 a2 a3 a4)
- translation: the meaning (often Indonesian or English)

Rules:
1. If a line contains multiple items separated by commas or （，）, split into separate items.
2. If pinyin is missing, leave it as an empty string — never invent pinyin.
3. If translation is missing, leave it as an empty string.
4. Ignore narrative sentences longer than ~40 characters that are not vocabulary definitions.
5. Ignore lines that are only numbers, punctuation, or Latin words with no Chinese.
6. Set "confidence" to "high" when all three fields are certain, "low" when any is uncertain or missing.
7. Convert tone numbers to tone marks (a1→ā, a2→á, a3→ǎ, a4→à).
8. Return ONLY a valid JSON array — no markdown fences, no explanation.

Return format: [{"hanzi":"...","pinyin":"...","translation":"...","confidence":"high"}]`;

// ── Helpers ───────────────────────────────────────────────────────────────────

const DATE_RE = /(\d{1,2})[./]+(\d{1,2})[./]+(\d{4})/;

function groupLinesByDate(text: string): LessonRaw[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const lessons: LessonRaw[] = [];
  let current: LessonRaw | null = null;

  for (const line of lines) {
    const m = line.match(DATE_RE);
    if (m) {
      const day = m[1].padStart(2, '0');
      const month = m[2].padStart(2, '0');
      const year = m[3];
      const dateStr = `${year}-${month}-${day}`;
      if (!lessons.find((l) => l.date === dateStr)) {
        current = { date: dateStr, lines: [] };
        lessons.push(current);
      }
      continue;
    }
    if (current) current.lines.push(line);
  }

  return lessons;
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

// Returns the Supabase admin client, or null if env vars are not configured.
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function loadSnapshot(): Promise<{ hash: string; dates: Set<string> } | null> {
  const admin = getAdminClient();
  if (!admin) return null;

  const { data } = await admin
    .from('doc_snapshots')
    .select('content, content_hash')
    .order('fetched_at', { ascending: false })
    .limit(1)
    .single();

  if (!data) return null;

  const dates = new Set(groupLinesByDate(data.content).map((l) => l.date));
  return { hash: data.content_hash, dates };
}

async function saveSnapshot(content: string, hash: string): Promise<void> {
  const admin = getAdminClient();
  if (!admin) return;
  await admin.from('doc_snapshots').insert({ content, content_hash: hash });
}

async function parseWithClaude(
  client: Anthropic,
  lesson: LessonRaw
): Promise<ParsedVocabItem[]> {
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: PARSER_SYSTEM,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Lesson date: ${lesson.date}\n\n${lesson.lines.join('\n')}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return [];

    const clean = textBlock.text
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item: any) => item && typeof item.hanzi === 'string' && item.hanzi.trim())
      .map((item: any) => ({
        hanzi: String(item.hanzi || '').trim(),
        pinyin: String(item.pinyin || '').trim(),
        translation: String(item.translation || '').trim(),
        confidence: item.confidence === 'low' ? 'low' : 'high',
      }));
  } catch (err) {
    console.error(`Claude parse error for lesson ${lesson.date}:`, err);
    return [];
  }
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) {
    return new Response(
      JSON.stringify({ success: false, error: 'ANTHROPIC_API_KEY is not set in .env.local' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let existingDates: string[] = [];
  try {
    const body = await request.json();
    if (body && Array.isArray(body.existingDates)) existingDates = body.existingDates;
  } catch (_) {}

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch (_) {}
      };

      try {
        // Step 1: fetch the doc
        const docRes = await fetch(DOC_URL, { cache: 'no-store', signal: request.signal });
        if (!docRes.ok) {
          emit({ type: 'error', message: `Failed to fetch Google Doc: ${docRes.statusText}` });
          controller.close();
          return;
        }
        const rawText = await docRes.text();
        const currentHash = hashText(rawText);

        // Step 2: load last snapshot and check if the doc changed
        const snapshot = await loadSnapshot();

        if (snapshot && snapshot.hash === currentHash) {
          // Doc is identical to the last snapshot — nothing to parse
          emit({ type: 'done', lessonsParsed: 0, message: 'Doc unchanged since last sync — already up to date!' });
          controller.close();
          return;
        }

        // Step 3: find lessons that are new (not in snapshot AND not already approved/pending)
        const allLessons = groupLinesByDate(rawText);
        if (allLessons.length === 0) {
          emit({ type: 'error', message: 'No lesson dates found in document.' });
          controller.close();
          return;
        }

        const knownDates = new Set([
          ...(snapshot?.dates ?? []),
          ...existingDates,
        ]);
        const newLessons = allLessons
          .filter((l) => !knownDates.has(l.date) && l.lines.length > 0);

        if (newLessons.length === 0) {
          // Doc changed (e.g. formatting) but no new lesson dates — save snapshot and bail
          await saveSnapshot(rawText, currentHash);
          emit({ type: 'done', lessonsParsed: 0, message: 'All lessons are already up to date!' });
          controller.close();
          return;
        }

        // Step 4: parse only the new lessons
        emit({ type: 'start', total: newLessons.length });
        const client = new Anthropic({ apiKey });

        for (let i = 0; i < newLessons.length; i++) {
          if (request.signal.aborted) break;

          const lesson = newLessons[i];
          emit({ type: 'parsing', date: lesson.date, index: i + 1, total: newLessons.length });

          const items = await parseWithClaude(client, lesson);

          emit({
            type: 'lesson',
            date: lesson.date,
            rawLineCount: lesson.lines.length,
            items: items.map((item, idx) => ({ ...item, id: `${lesson.date}_${idx}` })),
          });

          if (i < newLessons.length - 1 && !request.signal.aborted) {
            await new Promise((r) => setTimeout(r, 500));
          }
        }

        // Step 5: save the new snapshot (only after successful parse)
        if (!request.signal.aborted) {
          await saveSnapshot(rawText, currentHash);
        }

        emit({ type: 'done' });
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          emit({ type: 'error', message: err.message || 'Unexpected error during AI parsing.' });
        }
      } finally {
        controller.close();
      }
    },
    cancel() {},
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
