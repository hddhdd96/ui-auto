import 'dotenv/config';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const demoPort = Number(process.env.DEMO_PORT ?? 4173);
const localBaseURL = `http://127.0.0.1:${demoPort}`;
const baseURL = process.env.BASE_URL || localBaseURL;
const authStatePath = path.join(__dirname, 'auth', 'storageState.json');
const browser = { ...devices['Desktop Chrome'], storageState: authStatePath };

export default defineConfig({
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  maxFailures: 1,
  workers: 1,
  reporter: [
    ['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['./reporters/failure-summary.ts'],
  ],
  outputDir: 'test-results',
  webServer: process.env.BASE_URL ? undefined : {
    command: 'node demo/server.mjs', url: `${localBaseURL}/health`, reuseExistingServer: false,
    env: { DEMO_PORT: String(demoPort) },
  },
  use: { baseURL, screenshot: 'only-on-failure', trace: 'retain-on-failure', video: 'retain-on-failure' },
  projects: [
    { name: 'setup', testDir: './auth', testMatch: '**/auth.setup.ts', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium', testMatch: 'tests/testsuite/**/*.spec.ts', dependencies: ['setup'], use: browser },
    { name: 'demo', testMatch: 'tests/demo/**/*.spec.ts', dependencies: ['setup'], use: browser },
    { name: 'unit', testDir: './tests/unit', testMatch: '**/*.spec.ts' },
    // 실패 원인 분류 실험 전용. npm test에는 포함하지 않는다(npm run triage:lab).
    { name: 'triage-lab', testMatch: 'tests/triage-lab/**/*.spec.ts', dependencies: ['setup'], use: { ...browser, actionTimeout: 10_000 } },
    { name: 'external', testMatch: 'tests/external/**/*.spec.ts', use: {
      ...devices['Desktop Chrome'], baseURL: 'https://demo.playwright.dev', storageState: { cookies: [], origins: [] },
    } },
  ],
});
