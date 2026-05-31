// Fetches the shared Google Doc, groups lines by lesson date, then uses Claude AI to
// extract structured vocabulary (hanzi / pinyin / translation) from each lesson.

import { NextResponse } from 'next/server';
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
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'ANTHROPIC_API_KEY is not set in .env.local' },
        { status: 400 }
      );
    }

    let existingDates: string[] = [];
    try {
      const body = await request.json();
      if (body && Array.isArray(body.existingDates)) existingDates = body.existingDates;
    } catch (_) {}

    // Fetch the public Google Doc
    const docRes = await fetch(DOC_URL, { cache: 'no-store' });
    if (!docRes.ok) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch Google Doc: ${docRes.statusText}` },
        { status: 502 }
      );
    }
    const rawText = await docRes.text();

    // Group lines by lesson date
    const lessons = groupLinesByDate(rawText);
    if (lessons.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No lesson dates found in document.' },
        { status: 422 }
      );
    }

    // Skip already-processed lessons
    const newLessons = lessons.filter((l) => !existingDates.includes(l.date));
    if (newLessons.length === 0) {
      return NextResponse.json({
        success: true,
        lessonsFound: lessons.length,
        lessonsParsed: 0,
        totalWords: 0,
        lessons: {},
        message: 'All lessons are already up to date!',
      });
    }

    const client = new Anthropic({ apiKey });
    const results: Record<string, { date: string; rawLineCount: number; items: (ParsedVocabItem & { id: string })[] }> = {};
    const activeLessons = newLessons.filter((l) => l.lines.length > 0);

    for (let i = 0; i < activeLessons.length; i++) {
      const lesson = activeLessons[i];
      const items = await parseWithClaude(client, lesson);

      if (items.length > 0) {
        results[lesson.date] = {
          date: lesson.date,
          rawLineCount: lesson.lines.length,
          items: items.map((item, idx) => ({ ...item, id: `${lesson.date}_${idx}` })),
        };
      }

      // Small pause between sequential lessons
      if (i < activeLessons.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    const totalWords = Object.values(results).reduce((s, l) => s + l.items.length, 0);

    return NextResponse.json({
      success: true,
      lessonsFound: lessons.length,
      lessonsParsed: Object.keys(results).length,
      totalWords,
      lessons: results,
    });
  } catch (err: any) {
    console.error('Parse route error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Unexpected error during AI parsing.' },
      { status: 500 }
    );
  }
}
