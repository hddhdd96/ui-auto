import 'dotenv/config';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const authStatePath = path.join(__dirname, 'auth', 'storageState.json');

export default defineConfig({
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  outputDir: 'test-results',
  use: {
    baseURL: process.env.BASE_URL ?? 'https://example.com',
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testDir: './auth',
      testMatch: '**/auth.setup.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      testMatch: 'tests/testsuite/**/*.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: authStatePath,
      },
    },
    {
      name: 'demo',
      testMatch: 'tests/demo/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'https://demo.playwright.dev',
        // demo는 공개 사이트 — storageState 불필요
        storageState: { cookies: [], origins: [] },
      },
    },
    {
      name: 'unit',
      testDir: './tests/unit',
      testMatch: '**/*.spec.ts',
    },
  ],
});
