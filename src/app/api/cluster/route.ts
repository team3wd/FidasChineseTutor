// Clusters approved vocabulary into conversation readiness scenarios.
// POST body: { vocab: VocabItem[] with interval field }
// Returns: { scenarios: [{ name, readiness_pct, sample_words }] }

import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';

// ── Types ─────────────────────────────────────────────────────────────────────

interface VocabItemWithInterval {
  id: string;
  lesson_id: string;
  hanzi: string;
  pinyin: string;
  translation: string;
  interval: number; // SM-2 interval in days
}

interface ClusterScenario {
  name: string;
  readiness_pct: number;
  sample_words: string[];
  words: string[]; // all hanzi from input that belong to this topic
}

interface ClusterResponse {
  scenarios: ClusterScenario[];
}

// ── System prompt ──────────────────────────────────────────────────────────────

const CLUSTER_SYSTEM = `You are a Chinese language tutor assistant. Given a list of approved vocabulary items with their spaced-repetition maturity scores (interval), cluster them into conversation scenarios.

Rules:
1. Identify 5-8 realistic conversation scenarios (e.g. "Ordering food", "Making friends", "Describing emotions")
2. For each scenario, list ALL hanzi from the input that belong to that scenario in a "words" array
3. Pick 2-3 representative hanzi from that list for "sample_words"
4. Calculate readiness_pct as: (fraction_of_topic_words_present) × (average_interval_of_those_words / 30, capped at 1.0) × 100
   - Example: if 60% of "greeting" vocabulary is present with avg interval=20, readiness = 0.60 × (20/30) × 100 = 40%
5. Order scenarios by readiness_pct descending (most ready first)
6. Every hanzi from the input must appear in at least one scenario's "words" array

Return ONLY valid JSON array, no markdown fences or explanation:
[{"name":"Scenario Name","readiness_pct":42,"words":["你好","再见","谢谢"],"sample_words":["你好","再见"]}, ...]`;

// ── Handler ────────────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  try {
    const { vocab }: { vocab: VocabItemWithInterval[] } = await req.json();

    if (!Array.isArray(vocab) || vocab.length === 0) {
      return Response.json(
        { scenarios: [] },
        { status: 200 }
      );
    }

    // Cap at 200 items (sorted by highest interval first — most mature vocab)
    const vocabToCluster = vocab
      .slice()
      .sort((a, b) => (b.interval || 0) - (a.interval || 0))
      .slice(0, 200);

    // Build input for Claude: hanzi + translation + interval
    const vocabText = vocabToCluster
      .map((v) => `${v.hanzi} (${v.translation}) — interval: ${v.interval || 0}`)
      .join('\n');

    const client = new Anthropic();
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2048,
      system: [
        {
          type: 'text',
          text: CLUSTER_SYSTEM,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Approved vocabulary (${vocabToCluster.length} items):\n\n${vocabText}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return Response.json(
        { error: 'No text response from Claude' },
        { status: 500 }
      );
    }

    // Parse Claude's JSON response — strip markdown fences if Claude wraps output
    let scenarios: ClusterScenario[];
    try {
      const clean = textBlock.text
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      scenarios = JSON.parse(clean);
    } catch {
      console.error('Failed to parse cluster response:', textBlock.text);
      return Response.json(
        { error: 'Invalid JSON from Claude' },
        { status: 500 }
      );
    }

    // Validate structure and cap readiness at 100
    const validated: ClusterScenario[] = scenarios
      .filter((s) => s.name && typeof s.readiness_pct === 'number' && Array.isArray(s.sample_words))
      .map((s) => ({
        ...s,
        words: Array.isArray(s.words) ? s.words : s.sample_words,
        readiness_pct: Math.min(100, Math.max(0, s.readiness_pct)),
      }));

    return Response.json(
      { scenarios: validated },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('Cluster error:', err);
    return Response.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
