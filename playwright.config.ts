// Playwright global configuration
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // Where Playwright looks for test files — *.spec.ts only (*.test.ts are Vitest unit tests)
  testDir: './tests',
  testMatch: '**/*.spec.ts',

  // Run all tests in a file in parallel (each test gets its own browser context)
  fullyParallel: true,

  // Fail the build if you accidentally left test.only() in a file
  forbidOnly: !!process.env.CI,

  // How many times to retry a failed test (useful in CI, annoying locally)
  retries: process.env.CI ? 2 : 0,

  // How many worker processes to use (undefined = auto based on CPU cores)
  workers: process.env.CI ? 1 : undefined,

  // How test results are reported
  reporter: 'html',

  use: {
    // All page.goto('/some-path') calls resolve against this base URL
    baseURL: 'http://localhost:3001',

    // Save a trace (DOM snapshots + network log) on the first retry of a failed test.
    // Open it with: npx playwright show-trace trace.zip
    trace: 'on-first-retry',

    // Mobile-first: simulate an iPhone 14 Pro viewport by default
    ...devices['iPhone 14 Pro'],
  },

  projects: [
    // We only test Chromium for now. Add 'firefox' or 'webkit' entries here later.
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Start the Next.js dev server before running any tests, and shut it down after.
  // Playwright waits until localhost:3000 responds before it runs the first test.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI, // locally: reuse if already running
  },
});
