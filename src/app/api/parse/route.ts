// Fetches the shared Google Doc, groups lines by lesson date, then streams AI-parsed
// vocabulary via SSE — one event per lesson so the client can save results incrementally.

import Anthropic from '@anthropic-ai/sdk';

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

async function parseWithClaude(
  client: Anthropic,
  lesson: LessonRaw
): Promise<ParsedVocabItem[]> {
  try {
    const response = await client.messages.create({
      // Haiku 4.5: fast, cheap, and sufficient for structured extraction
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: PARSER_SYSTEM,
          // Cache the system prompt — it's identical across all lesson parses
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
        } catch (_) {
          // Client disconnected
        }
      };

      try {
        const docRes = await fetch(DOC_URL, { cache: 'no-store', signal: request.signal });
        if (!docRes.ok) {
          emit({ type: 'error', message: `Failed to fetch Google Doc: ${docRes.statusText}` });
          controller.close();
          return;
        }
        const rawText = await docRes.text();

        const lessons = groupLinesByDate(rawText);
        if (lessons.length === 0) {
          emit({ type: 'error', message: 'No lesson dates found in document.' });
          controller.close();
          return;
        }

        const newLessons = lessons.filter((l) => !existingDates.includes(l.date));
        if (newLessons.length === 0) {
          emit({ type: 'done', lessonsParsed: 0, message: 'All lessons are already up to date!' });
          controller.close();
          return;
        }

        const activeLessons = newLessons.filter((l) => l.lines.length > 0);
        emit({ type: 'start', total: activeLessons.length });

        const client = new Anthropic({ apiKey });

        for (let i = 0; i < activeLessons.length; i++) {
          if (request.signal.aborted) break;

          const lesson = activeLessons[i];
          emit({ type: 'parsing', date: lesson.date, index: i + 1, total: activeLessons.length });

          const items = await parseWithClaude(client, lesson);

          emit({
            type: 'lesson',
            date: lesson.date,
            rawLineCount: lesson.lines.length,
            items: items.map((item, idx) => ({ ...item, id: `${lesson.date}_${idx}` })),
          });

          if (i < activeLessons.length - 1 && !request.signal.aborted) {
            await new Promise((r) => setTimeout(r, 500));
          }
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
    cancel() {
      // Client disconnected — the request.signal.aborted check in the loop handles cleanup
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
