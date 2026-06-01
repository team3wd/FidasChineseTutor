// Practice tab E2E tests — tone game, multiple choice, fill-in-pinyin

import { test, expect, Page } from '@playwright/test';
import type { VocabItem, Lesson } from '../src/lib/types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const LESSON: Lesson = { id: 'l_test', date: '2024-01-15', context_text: '' };

// Uniform vocab: all tone 1 (ā), all pinyin "māo", all translation "cat".
// Whichever word the games randomly pick, the correct answer is always the same:
//   Tone game  → "¯ (1)" is always correct
//   Pinyin game → "māo" or "mao1" always correct
//   MC game    → the only option is "cat" (deduped), clicking it always correct
const VOCAB: VocabItem[] = [
  { id: 'v0', lesson_id: 'l_test', hanzi: '猫', pinyin: 'māo', translation: 'cat' },
  { id: 'v1', lesson_id: 'l_test', hanzi: '书', pinyin: 'māo', translation: 'cat' },
  { id: 'v2', lesson_id: 'l_test', hanzi: '花', pinyin: 'māo', translation: 'cat' },
  { id: 'v3', lesson_id: 'l_test', hanzi: '天', pinyin: 'māo', translation: 'cat' },
  { id: 'v4', lesson_id: 'l_test', hanzi: '飞', pinyin: 'māo', translation: 'cat' },
];

// Distinct vocab: unique pinyins + translations, needed for MC wrong-answer tests
// where at least one wrong option must be identifiable on the page.
// All tone 1 (māo, but note: other pinyins are also tone 1 or 3 — we don't rely on
// tone game correctness here because MC tests don't interact with that section).
const VOCAB_MC: VocabItem[] = [
  { id: 'v0', lesson_id: 'l_test', hanzi: '猫', pinyin: 'māo',  translation: 'cat'   },
  { id: 'v1', lesson_id: 'l_test', hanzi: '狗', pinyin: 'gǒu',  translation: 'dog'   },
  { id: 'v2', lesson_id: 'l_test', hanzi: '马', pinyin: 'mǎ',   translation: 'horse' },
  { id: 'v3', lesson_id: 'l_test', hanzi: '鸟', pinyin: 'niǎo', translation: 'bird'  },
  { id: 'v4', lesson_id: 'l_test', hanzi: '鱼', pinyin: 'yú',   translation: 'fish'  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function seedAndGo(page: Page, vocab: VocabItem[] = VOCAB) {
  await page.addInitScript((data) => {
    localStorage.setItem('ch_lessons',    JSON.stringify([data.lesson]));
    localStorage.setItem('ch_vocabulary', JSON.stringify(data.vocab));
    localStorage.setItem('ch_progress',   JSON.stringify({}));
  }, { lesson: LESSON, vocab });

  await page.goto('/');
  await page.getByRole('button', { name: 'Practice' }).click();
  await expect(page.getByRole('heading', { name: 'Practice Games' })).toBeVisible();
}

// Returns the translation of the word currently shown in Game 2 (MC section).
// Reads the pinyin element from the DOM to identify which VOCAB_MC entry is displayed.
async function getMcCorrectTranslation(page: Page): Promise<string> {
  const pinyin = await page.evaluate((): string => {
    const mcH3 = Array.from(document.querySelectorAll('h3'))
      .find(h => h.textContent?.trim() === 'Multiple Choice Match');
    const card = mcH3?.parentElement?.parentElement;
    const wordSection = card?.children[1] as HTMLElement | undefined;
    return (wordSection?.children[1] as HTMLElement)?.textContent?.trim() ?? '';
  });
  return VOCAB_MC.find(v => v.pinyin === pinyin)?.translation ?? '';
}

// Scopes assertions to the Game 3 card only, preventing false matches from
// "cat" appearing as an MC option in Game 2.
function game3Card(page: Page) {
  return page.locator('h3', { hasText: 'Type the Pinyin' }).locator('xpath=../..').first();
}

// ── Empty state ───────────────────────────────────────────────────────────────

test.describe('Practice tab — empty state', () => {

  test('shows "not enough vocabulary" when fewer than 5 words are loaded', async ({ page }) => {
    await page.addInitScript((lesson) => {
      localStorage.setItem('ch_lessons',    JSON.stringify([lesson]));
      localStorage.setItem('ch_vocabulary', JSON.stringify([
        { id: 'v0', lesson_id: 'l_test', hanzi: '猫', pinyin: 'māo', translation: 'cat' },
        { id: 'v1', lesson_id: 'l_test', hanzi: '狗', pinyin: 'gǒu', translation: 'dog' },
      ]));
      localStorage.setItem('ch_progress', JSON.stringify({}));
    }, LESSON);

    await page.goto('/');
    await page.getByRole('button', { name: 'Practice' }).click();

    await expect(page.getByText('Not enough vocabulary loaded.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mandarin Tone Practice' })).not.toBeVisible();
  });

});

// ── Game 1: Tone guessing ─────────────────────────────────────────────────────

test.describe('Practice tab — Game 1 (tone)', () => {

  test('renders the word and five tone buttons', async ({ page }) => {
    await seedAndGo(page);
    await expect(page.getByRole('heading', { name: 'Mandarin Tone Practice' })).toBeVisible();
    for (const label of ['¯ (1)', '´ (2)', 'ˇ (3)', '· (5)']) {
      await expect(page.getByRole('button', { name: label })).toBeVisible();
    }
  });

  test('correct tone shows Perfect! and reveals the pinyin', async ({ page }) => {
    await seedAndGo(page);
    // VOCAB has all "māo" (tone 1), so "¯ (1)" is always correct
    await page.getByRole('button', { name: '¯ (1)' }).click();
    await expect(page.getByText(/Perfect!/)).toBeVisible();
    // Reveals the correct pinyin in the feedback
    await expect(page.getByText(/māo/).first()).toBeVisible();
  });

  test('wrong tone shows Incorrect. and reveals the pinyin', async ({ page }) => {
    await seedAndGo(page);
    // Tone 2 is wrong for "māo" (tone 1)
    await page.getByRole('button', { name: '´ (2)' }).click();
    await expect(page.getByText(/Incorrect\./)).toBeVisible();
    await expect(page.getByText(/māo/).first()).toBeVisible();
  });

  test('tone buttons are disabled after answering', async ({ page }) => {
    await seedAndGo(page);
    await page.getByRole('button', { name: '¯ (1)' }).click();
    await expect(page.getByRole('button', { name: '´ (2)' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'ˇ (3)' })).toBeDisabled();
  });

  test('Next Word clears feedback and re-enables tone buttons', async ({ page }) => {
    await seedAndGo(page);
    await page.getByRole('button', { name: '¯ (1)' }).click();
    await expect(page.getByText(/Perfect!/)).toBeVisible();
    // Only Game 1's "Next Word" is visible (Game 3 not yet answered)
    await page.getByRole('button', { name: 'Next Word' }).click();
    await expect(page.getByText(/Perfect!/)).not.toBeVisible();
    await expect(page.getByRole('button', { name: '¯ (1)' })).toBeEnabled();
  });

});

// ── Game 2: Multiple choice ───────────────────────────────────────────────────

// VOCAB (uniform) is used for correct/disabled/next tests — with all words having
// translation "cat", the MC section always shows "cat" as the only option,
// so clicking it is deterministically correct.
//
// VOCAB_MC (distinct) is used for wrong-answer tests, with getMcCorrectTranslation()
// identifying the correct answer dynamically from the DOM.

test.describe('Practice tab — Game 2 (multiple choice)', () => {

  test('renders the word with option buttons', async ({ page }) => {
    await seedAndGo(page);
    await expect(page.getByRole('heading', { name: 'Multiple Choice Match' })).toBeVisible();
    // With VOCAB (all "cat"), the only unique MC option is "cat"
    await expect(page.getByRole('button', { name: 'cat' }).first()).toBeVisible();
  });

  test('selecting the correct option shows Excellent!', async ({ page }) => {
    await seedAndGo(page);
    // "cat" is always the correct answer with uniform vocab
    await page.getByRole('button', { name: 'cat' }).first().click();
    await expect(page.getByText('Excellent! That is correct.')).toBeVisible();
  });

  test('selecting a wrong option shows Incorrect. with the correct answer', async ({ page }) => {
    await seedAndGo(page, VOCAB_MC);
    // Identify which word is shown, then click a different option
    const correct = await getMcCorrectTranslation(page);
    const translations = VOCAB_MC.map(v => v.translation);
    let clicked = false;
    for (const t of translations) {
      if (t === correct) continue;
      const btn = page.getByRole('button', { name: t });
      if (await btn.isVisible()) {
        await btn.click();
        clicked = true;
        break;
      }
    }
    expect(clicked, 'should find at least one wrong MC option').toBe(true);
    await expect(page.getByText(/Incorrect\./)).toBeVisible();
    await expect(page.getByText(new RegExp(`Correct: "${correct}"`))).toBeVisible();
  });

  test('option buttons are disabled after answering', async ({ page }) => {
    await seedAndGo(page);
    await page.getByRole('button', { name: 'cat' }).first().click();
    // All "cat" buttons should be disabled now
    const catButtons = page.getByRole('button', { name: 'cat' });
    for (const btn of await catButtons.all()) {
      await expect(btn).toBeDisabled();
    }
  });

  test('Next Character clears feedback and re-enables options', async ({ page }) => {
    await seedAndGo(page);
    await page.getByRole('button', { name: 'cat' }).first().click();
    await expect(page.getByText('Excellent! That is correct.')).toBeVisible();
    await page.getByRole('button', { name: 'Next Character' }).click();
    await expect(page.getByText('Excellent! That is correct.')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'cat' }).first()).toBeEnabled();
  });

});

// ── Game 3: Fill-in pinyin ────────────────────────────────────────────────────

test.describe('Practice tab — Game 3 (fill-in pinyin)', () => {

  test('renders the hanzi and an empty input', async ({ page }) => {
    await seedAndGo(page);
    await expect(page.getByRole('heading', { name: 'Type the Pinyin' })).toBeVisible();
    await expect(page.getByPlaceholder(/e\.g\. nǐ hǎo/)).toBeVisible();
  });

  test('Check button is disabled when input is empty', async ({ page }) => {
    await seedAndGo(page);
    await expect(page.getByRole('button', { name: 'Check' })).toBeDisabled();
  });

  test('correct pinyin with tone marks shows Correct!', async ({ page }) => {
    await seedAndGo(page);
    // VOCAB has all "māo" — correct answer regardless of which word is shown
    await page.getByPlaceholder(/e\.g\. nǐ hǎo/).fill('māo');
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByText(/Correct!/)).toBeVisible();
  });

  test('correct pinyin with tone number is also accepted', async ({ page }) => {
    await seedAndGo(page);
    // "mao1" normalises to "mao" which equals normalise("māo") = "mao"
    await page.getByPlaceholder(/e\.g\. nǐ hǎo/).fill('mao1');
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByText(/Correct!/)).toBeVisible();
  });

  test('pressing Enter submits the answer', async ({ page }) => {
    await seedAndGo(page);
    await page.getByPlaceholder(/e\.g\. nǐ hǎo/).fill('māo');
    await page.getByPlaceholder(/e\.g\. nǐ hǎo/).press('Enter');
    await expect(page.getByText(/Correct!/)).toBeVisible();
  });

  test('wrong pinyin shows Incorrect. with the correct answer', async ({ page }) => {
    await seedAndGo(page);
    // "gou" is not "mao"
    await page.getByPlaceholder(/e\.g\. nǐ hǎo/).fill('gou');
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByText(/Incorrect\./)).toBeVisible();
    // Correct pinyin "māo" is shown in the feedback inside Game 3
    await expect(game3Card(page).getByText('māo')).toBeVisible();
  });

  test('input is disabled after submitting', async ({ page }) => {
    await seedAndGo(page);
    await page.getByPlaceholder(/e\.g\. nǐ hǎo/).fill('māo');
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByPlaceholder(/e\.g\. nǐ hǎo/)).toBeDisabled();
  });

  test('Show translation hint reveals the translation within Game 3', async ({ page }) => {
    await seedAndGo(page);
    // "cat" appears as an MC button in Game 2, but NOT inside Game 3 before the hint
    await expect(game3Card(page).getByText('cat')).not.toBeVisible();
    await page.getByRole('button', { name: 'Show translation hint' }).click();
    await expect(game3Card(page).getByText('cat')).toBeVisible();
  });

  test('Next Word clears feedback and re-enables the input', async ({ page }) => {
    await seedAndGo(page);
    await page.getByPlaceholder(/e\.g\. nǐ hǎo/).fill('māo');
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByText(/Correct!/)).toBeVisible();
    // Game 1 not answered → only one "Next Word" visible (Game 3's)
    await page.getByRole('button', { name: 'Next Word' }).click();
    await expect(page.getByText(/Correct!/)).not.toBeVisible();
    await expect(page.getByPlaceholder(/e\.g\. nǐ hǎo/)).toBeEnabled();
  });

});
