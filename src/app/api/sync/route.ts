import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const DEFAULT_DOC_URL = 'https://docs.google.com/document/d/1G-hYtWAY7cVasorrjrU_ZTeDiQNMERJlmbEfKl2UTN4/export?format=txt';

interface ParsedVocab {
  hanzi: string;
  pinyin: string;
  translation: string;
}

interface ParsedData {
  lessons: {
    [dateStr: string]: {
      vocabList: ParsedVocab[];
      contexts: string[];
    };
  };
}

export async function GET() {
  return handleSync();
}

export async function POST() {
  return handleSync();
}

async function handleSync() {
  try {
    const docUrl = process.env.NEXT_PUBLIC_GOOGLE_DOC_SYNC_URL || DEFAULT_DOC_URL;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    // 1. Fetch the plain text document export (anonymous public access)
    const response = await fetch(docUrl, { cache: 'no-store' });
    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: `Failed to fetch Google Document: ${response.statusText}`,
      }, { status: 500 });
    }

    const text = await response.text();
    
    // 2. Parse the document line-by-line
    const lines = text.split('\n');
    const parsedData: ParsedData = { lessons: {} };
    
    let currentDate: string | null = null;
    let pendingContexts: string[] = [];

    const dateRegex = /(\d{1,2})[./]+(\d{1,2})[./]+(\d{4})/;
    const chineseStartRegex = /^([\u4e00-\u9fa5（）\(\)\/，,\s\+]+)/;

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      // Check if it is a Date line
      const dateMatch = line.match(dateRegex);
      if (dateMatch) {
        const day = parseInt(dateMatch[1]);
        const month = parseInt(dateMatch[2]);
        const year = parseInt(dateMatch[3]);
        // Standardize YYYY-MM-DD
        currentDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        if (!parsedData.lessons[currentDate]) {
          parsedData.lessons[currentDate] = {
            vocabList: [],
            contexts: []
          };
        }

        // Flush any pending context sentences to this newly discovered date
        if (pendingContexts.length > 0) {
          parsedData.lessons[currentDate].contexts.push(...pendingContexts);
          pendingContexts = [];
        }
        continue;
      }

      // Check if it starts with Chinese characters
      const chineseMatch = line.match(chineseStartRegex);
      if (chineseMatch) {
        const hanziPart = chineseMatch[1].trim();

        // If it looks like a practice story sentence instead of a vocab item (long sentence, no '=')
        if (hanziPart.length > 18 && !line.includes('=')) {
          if (currentDate) {
            parsedData.lessons[currentDate].contexts.push(line);
          } else {
            pendingContexts.push(line);
          }
          continue;
        }

        // Parse vocabulary line
        const rest = line.substring(chineseMatch[0].length).trim();
        let pinyin = '';
        let translation = '';

        const separatorIndex = rest.search(/[=：:]/);
        if (separatorIndex !== -1) {
          pinyin = rest.substring(0, separatorIndex).trim();
          translation = rest.substring(separatorIndex + 1).trim();
        } else {
          // Fallback parsing for lines without clean delimiters (e.g. 侄女keponakan wanita)
          const alphabetMatch = rest.match(/^([a-zA-Z\sāáǎàēéěèīíǐìōóǒòūúǔùüǘǚǜū]+)(.*)/);
          if (alphabetMatch) {
            const part1 = alphabetMatch[1].trim();
            const part2 = alphabetMatch[2].trim();
            if (part2) {
              pinyin = part1;
              translation = part2;
            } else {
              pinyin = part1;
              translation = '';
            }
          } else {
            translation = rest;
          }
        }

        // Clean leading separators from translation
        translation = translation.replace(/^[=：:]\s*/, '').trim();

        if (hanziPart && hanziPart.length <= 25) {
          const vocabItem: ParsedVocab = {
            hanzi: hanziPart,
            pinyin: pinyin || '(No Pinyin)',
            translation: translation || '(No Translation)'
          };

          if (currentDate) {
            parsedData.lessons[currentDate].vocabList.push(vocabItem);
          }
        }
      } else {
        // If it doesn't start with Chinese but we have standard text, it might be lesson stories/context in Indonesian/English
        if (line.length > 10 && !line.includes('=')) {
          if (currentDate) {
            parsedData.lessons[currentDate].contexts.push(line);
          } else {
            pendingContexts.push(line);
          }
        }
      }
    }

    // Check if Supabase credentials are configured
    const isSupabaseConfigured = 
      supabaseUrl && 
      !supabaseUrl.includes('your-project-id') && 
      supabaseServiceKey && 
      !supabaseServiceKey.includes('dummy_key');

    if (!isSupabaseConfigured) {
      // 3a. Return the parsed data directly for Client Local Storage Mode (Guest Mode fallback)
      return NextResponse.json({
        success: true,
        mode: 'local',
        warning: 'Supabase credentials are not configured. Running in Local Storage Mode!',
        parsedData
      });
    }

    // 3b. Database synchronization (Upsert lessons and vocabularies in Supabase)
    let lessonsSynced = 0;
    let vocabSynced = 0;
    const errors: string[] = [];

    for (const [dateStr, lessonData] of Object.entries(parsedData.lessons)) {
      // Concatenate context lines to form a clean lesson story paragraph
      const contextText = lessonData.contexts.join('\n\n');

      // Sync Lesson
      const { data: lessonRecord, error: lessonError } = await supabaseAdmin
        .from('lessons')
        .upsert(
          { date: dateStr, context_text: contextText },
          { onConflict: 'date' }
        )
        .select()
        .single();

      if (lessonError) {
        errors.push(`Error upserting lesson for ${dateStr}: ${lessonError.message}`);
        continue;
      }

      lessonsSynced++;

      // Sync Vocabulary Items for this Lesson
      for (const vocab of lessonData.vocabList) {
        const { error: vocabError } = await supabaseAdmin
          .from('vocabulary')
          .upsert(
            {
              lesson_id: lessonRecord.id,
              hanzi: vocab.hanzi,
              pinyin: vocab.pinyin,
              translation: vocab.translation
            },
            { onConflict: 'lesson_id,hanzi' }
          );

        if (vocabError) {
          errors.push(`Error upserting word "${vocab.hanzi}" in lesson ${dateStr}: ${vocabError.message}`);
        } else {
          vocabSynced++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      mode: 'supabase',
      summary: {
        lessonsProcessed: Object.keys(parsedData.lessons).length,
        lessonsSynced,
        vocabularySynced: vocabSynced,
        errors: errors.length > 0 ? errors : undefined
      }
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || 'An unexpected error occurred during sync.'
    }, { status: 500 });
  }
}
