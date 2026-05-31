// Test D: Review tab — inspect, approve one, edit, and approve all
//
// New techniques:
//   - Shared helper function  — seeds localStorage + navigates, called from each test
//   - getByText(/regex/)      — partial/pattern text matching (used to click the lesson card)
//   - getByRole with name     — works for icon-only buttons once aria-label is added
//   - .nth(n)                 — pick one from multiple matches of the same locator
//   - getByRole('textbox')    — target text inputs by their input role
//   - .toHaveCount()          — assert the exact number of matching elements
//   - .toHaveValue()          — assert the current value of an input

import { test, expect, Page } from '@playwright/test';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TWO_ITEM_LESSON = {
  '2024-03-10': {
    date: '2024-03-10',
    rawLineCount: 3,
    items: [
      { id: '2024-03-10_0', hanzi: '谢谢', pinyin: 'xiè xiè',  translation: 'thank you', confidence: 'high' },
      { id: '2024-03-10_1', hanzi: '再见', pinyin: 'zài jiàn', translation: 'goodbye',   confidence: 'high' },
    ],
  },
};

const ONE_ITEM_LESSON = {
  '2024-03-10': {
    date: '2024-03-10',
    rawLineCount: 1,
    items: [
      { id: '2024-03-10_0', hanzi: '谢谢', pinyin: 'xiè xiè', translation: 'thank you', confidence: 'high' },
    ],
  },
};

// ── Shared helper ─────────────────────────────────────────────────────────────

async function seedAndOpenLesson(page: Page, pendingStore: object) {
  await page.addInitScript((store) => {
    localStorage.setItem('ch_pending',    JSON.stringify(store));
    localStorage.setItem('ch_lessons',    JSON.stringify([]));
    localStorage.setItem('ch_vocabulary', JSON.stringify([]));
    localStorage.setItem('ch_progress',   JSON.stringify({}));
  }, pendingStore);

  await page.goto('/');
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByRole('heading', { name: 'Review Queue' })).toBeVisible();

  // Click the lesson card to enter the detail view.
  //
  // WHY a regex and not plain text: getByText('words', { exact: false }) would ALSO
  // match the description paragraph ("AI-parsed words waiting…") which appears earlier
  // in the DOM. Clicking that paragraph does nothing because it has no onClick handler.
  //
  // /\d+ words/ only matches the word-count span inside the lesson card ("2 words",
  // "1 words" etc.) so the click correctly bubbles up to the card's onClick.
  await page.getByText(/\d+ words/).click();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Review tab — inspect words', () => {

  test('opening a lesson shows all its vocab items', async ({ page }) => {
    await seedAndOpenLesson(page, TWO_ITEM_LESSON);

    await expect(page.getByText('谢谢')).toBeVisible();
    await expect(page.getByText('再见')).toBeVisible();

    // .toHaveCount() asserts exact number of Reject buttons — one per item,
    // unlike Approve which also appears in the "Approve All" header button.
    await expect(page.getByRole('button', { name: 'Reject' })).toHaveCount(2);
  });

});

test.describe('Review tab — approve one word', () => {

  test('approving a word removes it from the list', async ({ page }) => {
    await seedAndOpenLesson(page, ONE_ITEM_LESSON);

    await expect(page.getByText('谢谢')).toBeVisible();

    // exact: true prevents matching "Approve All" (which contains "Approve" as a substring).
    await page.getByRole('button', { name: 'Approve', exact: true }).click();

    await expect(page.getByText('No words pending review.')).toBeVisible();
  });

  test('approving one of two words leaves the other intact', async ({ page }) => {
    await seedAndOpenLesson(page, TWO_ITEM_LESSON);

    // exact: true so we don't accidentally match "Approve All".
    // .first() then picks the first item's individual Approve button.
    await page.getByRole('button', { name: 'Approve', exact: true }).first().click();

    // 谢谢 (first item) is gone; 再见 (second item) remains
    await expect(page.getByText('谢谢')).not.toBeVisible();
    await expect(page.getByText('再见')).toBeVisible();
  });

});

test.describe('Review tab — edit a word', () => {

  test('edit form pre-fills with the current values', async ({ page }) => {
    await seedAndOpenLesson(page, ONE_ITEM_LESSON);

    await page.getByRole('button', { name: 'Edit' }).click();

    // The edit form renders three <input> elements.
    // getByRole('textbox') matches all of them; they appear in order: Hanzi, Pinyin, Translation.
    const inputs = page.getByRole('textbox');
    await expect(inputs).toHaveCount(3);

    await expect(inputs.nth(0)).toHaveValue('谢谢');
    await expect(inputs.nth(1)).toHaveValue('xiè xiè');
    await expect(inputs.nth(2)).toHaveValue('thank you');
  });

  test('saving an edit updates the displayed translation', async ({ page }) => {
    await seedAndOpenLesson(page, ONE_ITEM_LESSON);

    await page.getByRole('button', { name: 'Edit' }).click();

    const translationInput = page.getByRole('textbox').nth(2);
    await translationInput.clear();
    await translationInput.fill('thanks / thank you');

    await page.getByRole('button', { name: 'Save' }).click();

    // Edit form is gone, updated text is shown
    await expect(page.getByRole('button', { name: 'Save' })).not.toBeVisible();
    await expect(page.getByText('thanks / thank you')).toBeVisible();
  });

  test('cancelling an edit restores the original value', async ({ page }) => {
    await seedAndOpenLesson(page, ONE_ITEM_LESSON);

    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('textbox').nth(2).fill('changed');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByText('thank you')).toBeVisible();
  });

});

test.describe('Review tab — approve all', () => {

  test('Approve All clears every word and shows the empty state', async ({ page }) => {
    await seedAndOpenLesson(page, TWO_ITEM_LESSON);

    // "Approve All" has visible text so getByRole works cleanly here —
    // no aria-label trick needed, the button label IS the accessible name.
    await page.getByRole('button', { name: 'Approve All' }).click();

    await expect(page.getByText('No words pending review.')).toBeVisible();
  });

});

test.describe('Review tab — empty states', () => {

  test('empty pending store shows no-words message', async ({ page }) => {
    // Seeding ch_pending as {} means there are no lessons at all.
    // The queue renders its empty state immediately on load.
    await page.addInitScript(() => {
      localStorage.setItem('ch_pending',    JSON.stringify({}));
      localStorage.setItem('ch_lessons',    JSON.stringify([]));
      localStorage.setItem('ch_vocabulary', JSON.stringify([]));
      localStorage.setItem('ch_progress',   JSON.stringify({}));
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Review' }).click();

    await expect(page.getByText('No words pending review.')).toBeVisible();

    // The lesson list area should have no cards — no Reject buttons anywhere
    await expect(page.getByRole('button', { name: 'Reject' })).toHaveCount(0);
  });

  test('Approve All on a 0-item lesson removes the card from the queue', async ({ page }) => {
    const EMPTY_LESSON = {
      '2024-03-10': { date: '2024-03-10', rawLineCount: 2, items: [] },
    };

    await page.addInitScript((store) => {
      localStorage.setItem('ch_pending',    JSON.stringify(store));
      localStorage.setItem('ch_lessons',    JSON.stringify([]));
      localStorage.setItem('ch_vocabulary', JSON.stringify([]));
      localStorage.setItem('ch_progress',   JSON.stringify({}));
    }, EMPTY_LESSON);

    await page.goto('/');
    await page.getByRole('button', { name: 'Review' }).click();
    await page.getByText('0 words', { exact: true }).click();

    await page.getByRole('button', { name: 'Approve All' }).click();

    await expect(page.getByText('No words pending review.')).toBeVisible();
  });

  test('lesson with 0 items shows "0 words" card', async ({ page }) => {
    // A lesson entry exists in the store but its items array is empty.
    // This edge case can occur if all words were rejected before the page reloaded.
    const EMPTY_LESSON = {
      '2024-03-10': {
        date: '2024-03-10',
        rawLineCount: 2,
        items: [],
      },
    };

    await page.addInitScript((store) => {
      localStorage.setItem('ch_pending',    JSON.stringify(store));
      localStorage.setItem('ch_lessons',    JSON.stringify([]));
      localStorage.setItem('ch_vocabulary', JSON.stringify([]));
      localStorage.setItem('ch_progress',   JSON.stringify({}));
    }, EMPTY_LESSON);

    await page.goto('/');
    await page.getByRole('button', { name: 'Review' }).click();

    // The lesson card is still rendered — the queue is not empty in terms of keys
    await expect(page.getByText('0 words', { exact: true })).toBeVisible();

    // Clicking into it shows an empty detail view with no item action buttons
    await page.getByText('0 words', { exact: true }).click();
    await expect(page.getByRole('button', { name: 'Reject' })).toHaveCount(0);
  });

});
