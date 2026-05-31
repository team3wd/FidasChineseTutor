// Test B: flashcard flip with seeded localStorage
//
// Teaches:
//   - page.addInitScript()  — run JS in the browser BEFORE the page loads (used to seed localStorage)
//   - page.locator()        — find elements by CSS selector or text (fallback when no ARIA role fits)
//   - chaining assertions   — toBeVisible(), toContainText()
//   - testing state changes — assert before click, then assert after click

import { test, expect } from '@playwright/test';
import type { VocabItem, Lesson } from '../src/lib/types';

// Fixtures: the data we'll plant into localStorage before each test.
// These are plain objects — no database, no API call needed.
const LESSON: Lesson = {
  id: 'l_2024-01-15',
  date: '2024-01-15',
  context_text: '',
};

const VOCAB: VocabItem = {
  id: '2024-01-15_0',
  lesson_id: 'l_2024-01-15',
  hanzi: '你好',
  pinyin: 'nǐ hǎo',
  translation: 'hello',
};

test.describe('Flashcard flip', () => {

  test.beforeEach(async ({ page }) => {
    // addInitScript() runs this function inside the browser context BEFORE
    // the page's own JavaScript executes. That means when React mounts and
    // reads localStorage in useEffect, the data is already there.
    //
    // This is the key pattern for testing localStorage-driven apps:
    // you never click through the UI to set up state — you plant it directly.
    await page.addInitScript((data: { lesson: Lesson; vocab: VocabItem }) => {
      localStorage.setItem('ch_lessons', JSON.stringify([data.lesson]));
      localStorage.setItem('ch_vocabulary', JSON.stringify([data.vocab]));
      localStorage.setItem('ch_progress', JSON.stringify({}));
    }, { lesson: LESSON, vocab: VOCAB });

    await page.goto('/');

    // Navigate to the Flashcards tab
    await page.getByRole('button', { name: 'Flashcards' }).click();
  });

  test('shows the hanzi on the front of the card', async ({ page }) => {
    // The card front renders the hanzi in large text.
    // getByText() finds any element containing this exact string.
    await expect(page.getByText('你好').first()).toBeVisible();

    // The prompt text is also visible before flipping
    await expect(page.getByText('Tap to reveal')).toBeVisible();
  });

  test('flipping the card reveals pinyin and translation', async ({ page }) => {
    // Locate the flip container by its CSS class — used here because this
    // element has no ARIA role or accessible name to target.
    const card = page.locator('.flip-container');
    await expect(card).toBeVisible();

    // Click the card to flip it.
    // Note: pinyin/translation ARE in the DOM before flipping (CSS 3D transform hides them),
    // so we can't use not.toBeVisible() here — Playwright doesn't detect transform-based hiding.
    // The grade buttons test covers "hidden before flip" via a real conditional render instead.
    await card.click();

    // After flipping: pinyin and translation appear on the back
    await expect(page.getByText('nǐ hǎo')).toBeVisible();
    await expect(page.getByText('hello')).toBeVisible();
  });

  test('grade buttons appear only after the card is flipped', async ({ page }) => {
    const card = page.locator('.flip-container');

    // Grade buttons are hidden until the card is flipped
    await expect(page.getByRole('button', { name: /Forgot/i })).not.toBeVisible();

    await card.click();

    // All five grade buttons should now be visible
    await expect(page.getByRole('button', { name: /Forgot/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Easy/i })).toBeVisible();
  });

  test('grading a card advances to the next card or shows completion', async ({ page }) => {
    const card = page.locator('.flip-container');
    await card.click();

    // Click "Easy" (grade 5) — since we only seeded one card, the queue
    // should empty and show the completion message.
    await page.getByRole('button', { name: /Easy/i }).click();

    await expect(page.getByText('Your review stack is fully clear.')).toBeVisible();
  });

});
