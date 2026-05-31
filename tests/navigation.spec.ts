// Test A: bottom-nav tab switching
//
// Teaches:
//   - page.goto()          — navigate to a URL
//   - page.getByRole()     — find elements by their ARIA role + accessible name
//   - expect().toBeVisible() — assert something is on screen (auto-waits up to the timeout)

import { test, expect } from '@playwright/test';

// Each test() block is one scenario. Playwright runs them in isolation —
// a fresh browser context (blank localStorage, no cookies) for every test.
test.describe('Bottom navigation', () => {

  // Before every test in this describe block, go to the app root.
  // Because baseURL is set in playwright.config.ts, '/' resolves to http://localhost:3001
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('loads on the Lessons tab by default', async ({ page }) => {
    // getByRole finds elements by their semantic role.
    // 'heading' matches any <h1>–<h6>. { name: '...' } filters by visible text.
    // This is the preferred locator style — it mirrors how a screen reader sees the page.
    await expect(page.getByRole('heading', { name: 'Your Tutor Lessons' })).toBeVisible();
  });

  test('switches to Flashcards tab', async ({ page }) => {
    // getByRole('button', { name: 'Flashcards' }) finds the nav button by its label text.
    // .click() simulates a real mouse click.
    await page.getByRole('button', { name: 'Flashcards' }).click();

    // After clicking, Playwright waits (up to the default timeout) for this to become visible.
    // No manual sleep() needed — expect() retries automatically.
    await expect(page.getByRole('heading', { name: 'Active Reviews' })).toBeVisible();
  });

  test('switches to Practice tab', async ({ page }) => {
    await page.getByRole('button', { name: 'Practice' }).click();
    await expect(page.getByRole('heading', { name: 'Practice Games' })).toBeVisible();
  });

  test('switches to Review tab', async ({ page }) => {
    await page.getByRole('button', { name: 'Review' }).click();
    await expect(page.getByRole('heading', { name: 'Review Queue' })).toBeVisible();
  });

  test('switches to Stats tab', async ({ page }) => {
    await page.getByRole('button', { name: 'Stats' }).click();
    await expect(page.getByRole('heading', { name: 'Study Progress Summary' })).toBeVisible();
  });

});
