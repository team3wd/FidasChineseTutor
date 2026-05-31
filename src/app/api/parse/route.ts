import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';

const DOC_URL =
  process.env.NEXT_PUBLIC_GOOGLE_DOC_SYNC_URL ||
  'https://docs.google.com/document/d/1G-hYtWAY7cVasorrjrU_ZTeDiQNMERJlmbEfKl2UTN4/export?format=txt';

// ── Types ──────────────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

const DATE_RE = /(\d{1,2})[./]+(\d{1,2})[./]+(\d{4})/;
const CHINESE_START_RE = /^[\u4e00-\u9fa5]/;

/** Split the raw document text into lesson buckets by date header */
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
      // Avoid duplicate date buckets (doc has some repeated date headers)
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

/** Send one lesson's raw lines to Gemini and return structured vocab */
async function parseWithGemini(
  gemini: GoogleGenerativeAI,
  lesson: LessonRaw
): Promise<ParsedVocabItem[]> {
  const model = gemini.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `You are a Chinese language tutor assistant. The following lines come from a Chinese language lesson held on ${lesson.date}.

Each line may contain one or more Chinese vocabulary items. A vocabulary item consists of:
- Hanzi (Chinese characters)
- Pinyin (romanised pronunciation, possibly with tone marks like ā á ǎ à or tone numbers like a1 a2 a3 a4)
- Translation (the meaning, often in Indonesian or English)

Your job is to extract every vocabulary item from these lines. Rules:
1. If a line contains MULTIPLE vocabulary items separated by commas or Chinese punctuation （，）, split them into separate items.
2. If Pinyin is missing, leave it as an empty string — do NOT invent it.
3. If Translation is missing, leave it as an empty string.
4. Ignore long story/narrative sentences (sentences longer than ~40 characters that are not vocabulary definitions).
5. Ignore lines that are only numbers, only punctuation, or only Latin alphabet words.
6. For each item, set "confidence" to "high" if you are certain about all three fields, or "low" if any field is uncertain or missing.
7. Convert tone numbers to tone marks if present (e.g. a1→ā, a2→á, a3→ǎ, a4→à).
8. Return ONLY a valid JSON array. No markdown, no explanation, no code fences.

Lines to parse:
${lesson.lines.join('\n')}

Return format:
[{"hanzi":"...","pinyin":"...","translation":"...","confidence":"high"|"low"}]`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Strip any accidental markdown fences
    const clean = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(clean);

    if (!Array.isArray(parsed)) return [];

    // Validate and sanitise each item
    return parsed
      .filter((item: any) => item && typeof item.hanzi === 'string' && item.hanzi.trim())
      .map((item: any) => ({
        hanzi: String(item.hanzi || '').trim(),
        pinyin: String(item.pinyin || '').trim(),
        translation: String(item.translation || '').trim(),
        confidence: item.confidence === 'low' ? 'low' : 'high',
      }));
  } catch (err) {
    console.error(`Gemini parse error for lesson ${lesson.date}:`, err);
    return [];
  }
}

// ── Route Handler ──────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'GEMINI_API_KEY is not set in .env.local' },
        { status: 400 }
      );
    }

    // Try to get existing lesson dates from client body to avoid duplicate AI requests
    let existingDates: string[] = [];
    try {
      const body = await request.json();
      if (body && Array.isArray(body.existingDates)) {
        existingDates = body.existingDates;
      }
    } catch (e) {
      // Body might be empty or invalid JSON
    }

    // 1. Fetch the public Google Doc
    const docRes = await fetch(DOC_URL, { cache: 'no-store' });
    if (!docRes.ok) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch Google Doc: ${docRes.statusText}` },
        { status: 502 }
      );
    }
    const rawText = await docRes.text();

    // 2. Group lines by lesson date
    const lessons = groupLinesByDate(rawText);
    if (lessons.length === 0) {
      return NextResponse.json({ success: false, error: 'No lesson dates found in document.' }, { status: 422 });
    }

    // Filter out already parsed/approved lesson dates
    const newLessons = lessons.filter(l => !existingDates.includes(l.date));

    // If no new lessons, return early and save API rate limits entirely!
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

    // 3. Parse new lessons sequentially with a delay to stay strictly under the 15 RPM free tier limit
    const gemini = new GoogleGenerativeAI(apiKey);
    const results: Record<string, { date: string; rawLineCount: number; items: ParsedVocabItem[] }> = {};

    const DELAY_MS = 4500; // 4.5s delay between sequential calls to guarantee we stay below 15 RPM
    const activeLessons = newLessons.filter((l) => l.lines.length > 0);

    for (let i = 0; i < activeLessons.length; i++) {
      const lesson = activeLessons[i];

      // Parse with Gemini
      let items = await parseWithGemini(gemini, lesson);
      
      // If we got rate-limited or hit a glitch, retry once after a 60s wait (to allow the 1-minute RPM window to reset)
      if (items.length === 0 && lesson.lines.length > 0) {
        console.warn(`Empty response or rate limit for lesson ${lesson.date}, retrying after 60 seconds...`);
        await new Promise((r) => setTimeout(r, 60000));
        items = await parseWithGemini(gemini, lesson);
      }

      if (items.length > 0) {
        results[lesson.date] = {
          date: lesson.date,
          rawLineCount: lesson.lines.length,
          items: items.map((item, idx) => ({
            ...item,
            id: `${lesson.date}_${idx}`,
          })),
        };
      }

      // Pause to respect Gemini Free Tier 15 RPM (skip after last item)
      if (i < activeLessons.length - 1) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
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
