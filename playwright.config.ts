import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

const demoPort = Number(process.env.DEMO_PORT ?? 4173);
const localBaseURL = `http://127.0.0.1:${demoPort}`;
const baseURL = process.env.BASE_URL || localBaseURL;

/**
 * Immutable policy (guardrail-enforced):
 * - retries: 0
 * - timeout / expect.timeout are fixed budgets
 * - self-healing must not inflate these values
 */
export default defineConfig({
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'node demo/server.mjs',
        url: `${localBaseURL}/health`,
        reuseExistingServer: !process.env.CI,
        env: { DEMO_PORT: String(demoPort) },
      },
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'unit',
      testDir: './tests/unit',
      testMatch: '**/*.spec.ts',
    },
    {
      name: 'suites',
      testDir: './tests/suites',
      testMatch: '**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'tc',
      testDir: './tests/tc',
      testMatch: '**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
