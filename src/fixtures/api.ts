import { test as base, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { cleanupLeftovers } from '../api/cleanup';
import { ApiClient, newSession } from '../api/client';
import type { Session } from '../api/client';
import { Evidence } from '../api/evidence';
import { testConfig } from '../config';

export interface TestOptions {
  /** API 클라이언트가 조회 요청을 네트워크 오류 후 다시 보낼 횟수. 프로젝트 설정에서 바꾼다(flaky-stable은 3). */
  networkRetries: number;
}

interface TestFixtures {
  /** 테스트 한 건의 HTTP 응답 이력과 상태 폴링 이력 */
  evidence: Evidence;
  /** 관리자 권한 API 클라이언트. 테스트가 끝나면 남은 리소스를 일괄 삭제한다. */
  api: ApiClient;
  /** 일반 사용자 권한 API 클라이언트 */
  memberApi: ApiClient;
  /** 접두어가 붙은 고유한 리소스 이름을 만든다. 예: qa-web-k3f93 */
  uniqueName: (label: string) => string;
}

interface WorkerFixtures {
  /** 테스트가 기대한 포털 모드(결함 주입 플래그)와 실제로 떠 있는 포털의 모드가 같은지 확인한다. */
  portalMode: void;
  apiContext: APIRequestContext;
  /** 스위트(워커)당 한 번만 로그인하고 모든 테스트가 같은 세션을 쓴다. */
  adminSession: Session;
  memberSession: Session;
}

let sequence = 0;
/**
 * 워커 프로세스마다 다른 짧은 태그. 테스트가 실패하면 Playwright가 워커를 새로 띄우면서 sequence가 0으로 돌아가므로,
 * 태그 없이 번호만 쓰면 앞 테스트가 남긴 리소스와 이름이 겹칠 수 있다.
 */
const workerTag = Math.random().toString(36).slice(2, 6);

const isOn = (name: string) => ['true', '1'].includes((process.env[name] ?? '').toLowerCase());

/** 이 테스트 실행이 기대하는 포털 모드. 포털의 config.defects, config.flaky.*.enabled와 같은 형식이다. */
export function expectedPortalMode() {
  return {
    defects: {
      quotaApiBypass: isOn('DEFECT_QUOTA_API_BYPASS'),
      resizeMismatch: isOn('DEFECT_RESIZE_MISMATCH'),
    },
    flaky: {
      deleteLag: isOn('FLAKY_DELETE_LAG'),
      lateResponse: isOn('FLAKY_LATE_RESPONSE'),
      uiStale: isOn('FLAKY_UI_STALE'),
      network: isOn('FLAKY_NETWORK'),
      tokenRotate: isOn('FLAKY_TOKEN_ROTATE'),
    },
  };
}

export const test = base.extend<TestOptions & TestFixtures, WorkerFixtures>({
  networkRetries: [0, { option: true }],

  portalMode: [async ({ playwright }, use, workerInfo) => {
    const context = await playwright.request.newContext({ baseURL: workerInfo.project.use.baseURL });
    const flags = (await (await context.get('/api/test/flags')).json()) as {
      defects: Record<string, boolean>;
      flaky: Record<string, { enabled?: boolean }>;
    };
    await context.dispose();
    const actual = {
      defects: flags.defects,
      flaky: Object.fromEntries(Object.entries(flags.flaky).filter(([, v]) => typeof v === 'object').map(([k, v]) => [k, !!v.enabled])),
    };
    const expected = expectedPortalMode();
    // 이미 떠 있는 다른 모드의 포털을 재사용하면 결과를 믿을 수 없으므로, 테스트를 시작하기 전에 멈춘다.
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `테스트가 기대한 포털 모드(결함·Flaky 주입)와 실제 포털의 모드가 다릅니다. 기대: ${JSON.stringify(expected)}, 실제: ${JSON.stringify(actual)}. ` +
        '다른 모드로 떠 있는 포털을 재사용했을 수 있습니다. 포털을 종료하거나 PORTAL_PORT를 바꿔 다시 실행하세요.',
      );
    }
    await use();
  }, { scope: 'worker', auto: true }],

  apiContext: [async ({ playwright }, use, workerInfo) => {
    const context = await playwright.request.newContext({ baseURL: workerInfo.project.use.baseURL });
    await use(context);
    await context.dispose();
  }, { scope: 'worker' }],

  adminSession: [async ({ apiContext }, use) => {
    const session = newSession(testConfig.admin, testConfig.projectId);
    await new ApiClient(apiContext, session).login();
    await use(session);
  }, { scope: 'worker' }],

  memberSession: [async ({ apiContext }, use) => {
    const session = newSession(testConfig.member, testConfig.projectId);
    await new ApiClient(apiContext, session).login();
    await use(session);
  }, { scope: 'worker' }],

  evidence: async ({}, use, testInfo) => {
    const evidence = new Evidence();
    await use(evidence);
    // 실패한 테스트에는 판단 근거가 되는 이력을 붙인다.
    if (evidence.causes.length > 0) {
      await testInfo.attach('cause-log.json', { body: JSON.stringify(evidence.causes, null, 2), contentType: 'application/json' });
    }
    if (testInfo.status !== testInfo.expectedStatus) {
      await testInfo.attach('http-history.json', { body: JSON.stringify(evidence.http, null, 2), contentType: 'application/json' });
      await testInfo.attach('poll-history.json', { body: JSON.stringify(evidence.polls, null, 2), contentType: 'application/json' });
    }
  },

  api: async ({ apiContext, adminSession, evidence, networkRetries }, use) => {
    const client = new ApiClient(apiContext, adminSession, evidence, { networkRetries });
    await use(client);
    const report = await cleanupLeftovers(client);
    expect(report.failed, '테스트 후 남은 리소스 일괄 삭제에 실패한 항목').toEqual([]);
  },

  memberApi: async ({ apiContext, memberSession, evidence, networkRetries }, use) => {
    await use(new ApiClient(apiContext, memberSession, evidence, { networkRetries }));
  },

  uniqueName: async ({}, use) => {
    await use((label) => {
      sequence += 1;
      return `${testConfig.resourcePrefix}${label}-${workerTag}${sequence}`;
    });
  },
});

export { expect };

/** 프로젝트마다 기본으로 있는 네트워크·보안 그룹 ID */
export const defaults = {
  networkId: `net-default-${testConfig.projectId}`,
  securityGroupId: `sg-default-${testConfig.projectId}`,
};
