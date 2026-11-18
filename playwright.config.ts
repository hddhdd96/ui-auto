import { defineConfig, devices } from '@playwright/test';
import type { TestOptions } from './src/fixtures/api';

const port = process.env.PORTAL_PORT ?? '4173';
const baseURL = process.env.BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig<TestOptions>({
  testDir: './tests',
  outputDir: './test-results',
  // 포털은 메모리에 상태를 하나만 갖고 프로젝트 쿼터를 공유하므로 테스트를 순서대로 실행한다.
  workers: 1,
  fullyParallel: false,
  // 재시도로 실패를 가리지 않는다. 판정 기준은 AGENTS.md를 따른다.
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'artifacts/results.json' }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'api', testDir: './tests/api' },
    { name: 'ui', testDir: './tests/ui', use: { ...devices['Desktop Chrome'] } },
    { name: 'negative', testDir: './tests/negative', use: { ...devices['Desktop Chrome'] } },
    { name: 'defects', testDir: './tests/defects', use: { ...devices['Desktop Chrome'] } },
    // Flaky 재현: 같은 Flaky 플래그에서 개선 전(naive)은 간헐적으로 실패하고 개선 후(stable)는 통과해야 한다.
    { name: 'flaky-naive', testDir: './tests/flaky/naive', use: { ...devices['Desktop Chrome'] } },
    // stable은 조회 요청이 네트워크 오류로 끝나면 3번까지 다시 보낸다(환경 요인으로 기록).
    { name: 'flaky-stable', testDir: './tests/flaky/stable', use: { ...devices['Desktop Chrome'], networkRetries: 3 } },
  ],
  // BASE_URL을 직접 주면 이미 떠 있는 포털을 대상으로 하고, 아니면 로컬 포털을 띄운다.
  webServer: process.env.BASE_URL ? undefined : {
    command: 'npm run portal',
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    env: {
      PORTAL_PORT: port,
      TRANSITION_DELAY_MS: process.env.TRANSITION_DELAY_MS ?? '300',
      DEFECT_QUOTA_API_BYPASS: process.env.DEFECT_QUOTA_API_BYPASS ?? 'false',
      DEFECT_RESIZE_MISMATCH: process.env.DEFECT_RESIZE_MISMATCH ?? 'false',
      // FLAKY_로 시작하는 환경변수(플래그, 확률, 지연 시간, 시드)는 그대로 포털에 넘긴다.
      ...Object.fromEntries(Object.entries(process.env).filter(([key, value]) => key.startsWith('FLAKY_') && value !== undefined)) as Record<string, string>,
    },
  },
});
