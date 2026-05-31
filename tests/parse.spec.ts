// Test C: parse flow with a mocked /api/parse response
//
// Teaches:
//   - page.route()       — intercept any network request and return a fake response
//   - SSE mock           — how to simulate a streaming Server-Sent Events response
//   - end-to-end flow    — button click → API call → tab switch → DOM assertion
//   - why mocking matters — the test never calls real Claude API, so it's instant and free

import { test, expect } from '@playwright/test';

// The fake SSE payload we'll return instead of hitting the real Claude API.
// Each event is the SSE wire format: "data: <json>\n\n"
// This mirrors exactly what route.ts emits for one parsed lesson.
function buildFakeSSE(): string {
  const events = [
    { type: 'start', total: 1 },
    { type: 'parsing', date: '2024-03-10', index: 1, total: 1 },
    {
      type: 'lesson',
      date: '2024-03-10',
      rawLineCount: 3,
      items: [
        { hanzi: '谢谢', pinyin: 'xiè xiè', translation: 'thank you', confidence: 'high', id: '2024-03-10_0' },
        { hanzi: '再见', pinyin: 'zài jiàn', translation: 'goodbye',   confidence: 'high', id: '2024-03-10_1' },
      ],
    },
    { type: 'done' },
  ];

  // Each SSE event must end with a double newline — that's how the browser
  // knows where one event stops and the next begins.
  return events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('');
}

test.describe('Parse flow (mocked API)', () => {

  test.beforeEach(async ({ page }) => {
    // page.route() intercepts every request whose URL matches the pattern.
    // '**' is a glob wildcard that matches any host/path prefix.
    // Without it, '/api/parse' would only match that exact string, not 'http://localhost:3001/api/parse'.
    await page.route('**/api/parse', async (route) => {
      // route.fulfill() returns a fake response to the browser without
      // the request ever leaving the machine.
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        body: buildFakeSSE(),
      });
    });

    await page.goto('/');
  });

  test('sync button triggers parse and redirects to Review tab', async ({ page }) => {
    // The header button toggles between "Sync Doc" and "Stop" while parsing.
    await page.getByRole('button', { name: 'Sync Doc' }).click();

    // After the SSE stream ends with lessonsParsed > 0, the app automatically
    // switches to the Review tab. We assert on the heading to confirm the redirect.
    await expect(page.getByRole('heading', { name: 'Review Queue' })).toBeVisible();
  });

  test('parsed lesson appears in the Review Queue', async ({ page }) => {
    await page.getByRole('button', { name: 'Sync Doc' }).click();

    await expect(page.getByRole('heading', { name: 'Review Queue' })).toBeVisible();

    // exact: true matches elements whose full text is exactly "2 words".
    // Without it, strict mode fails because the status banner also contains "2 words".
    await expect(page.getByText('2 words', { exact: true })).toBeVisible();
  });

  test('opening a lesson shows the parsed vocab items', async ({ page }) => {
    await page.getByRole('button', { name: 'Sync Doc' }).click();

    await expect(page.getByRole('heading', { name: 'Review Queue' })).toBeVisible();

    // Click the lesson card to drill into it (exact: true avoids matching the status banner)
    await page.getByText('2 words', { exact: true }).click();

    // Both vocab items should now be visible in the review panel
    await expect(page.getByText('谢谢')).toBeVisible();
    await expect(page.getByText('再见')).toBeVisible();
  });

  test('the real /api/parse was never called', async ({ page }) => {
    // This test makes the interception explicit — we track whether the real
    // route handler was invoked and assert it was not.
    let realRequestMade = false;

    // Override the route to track calls (still returning the fake response)
    await page.route('**/api/parse', async (route) => {
      realRequestMade = true; // this will only be true if our mock is called (not the server)
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: buildFakeSSE(),
      });
    });

    await page.getByRole('button', { name: 'Sync Doc' }).click();
    await expect(page.getByRole('heading', { name: 'Review Queue' })).toBeVisible();

    // The mock was invoked (meaning the real server handler was bypassed)
    expect(realRequestMade).toBe(true);
  });

});
