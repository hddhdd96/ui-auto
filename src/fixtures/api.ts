import { test as base, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { cleanupLeftovers } from '../api/cleanup';
import { ApiClient, newSession } from '../api/client';
import type { Session } from '../api/client';
import { Evidence } from '../api/evidence';
import { testConfig } from '../config';

interface TestFixtures {
  /** 테스트 한 건의 HTTP 응답 이력과 상태 폴링 이력 */
  evidence: Evidence;
  /** 관리자 권한 API 클라이언트. 테스트가 끝나면 남은 리소스를 일괄 삭제한다. */
  api: ApiClient;
  /** 일반 사용자 권한 API 클라이언트 */
  memberApi: ApiClient;
  /** 접두어가 붙은 고유한 리소스 이름을 만든다. 예: qa-web-3 */
  uniqueName: (label: string) => string;
}

interface WorkerFixtures {
  apiContext: APIRequestContext;
  /** 스위트(워커)당 한 번만 로그인하고 모든 테스트가 같은 세션을 쓴다. */
  adminSession: Session;
  memberSession: Session;
}

let sequence = 0;

export const test = base.extend<TestFixtures, WorkerFixtures>({
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
    if (testInfo.status !== testInfo.expectedStatus) {
      await testInfo.attach('http-history.json', { body: JSON.stringify(evidence.http, null, 2), contentType: 'application/json' });
      await testInfo.attach('poll-history.json', { body: JSON.stringify(evidence.polls, null, 2), contentType: 'application/json' });
    }
  },

  api: async ({ apiContext, adminSession, evidence }, use) => {
    const client = new ApiClient(apiContext, adminSession, evidence);
    await use(client);
    const report = await cleanupLeftovers(client);
    expect(report.failed, '테스트 후 남은 리소스 일괄 삭제에 실패한 항목').toEqual([]);
  },

  memberApi: async ({ apiContext, memberSession, evidence }, use) => {
    await use(new ApiClient(apiContext, memberSession, evidence));
  },

  uniqueName: async ({}, use) => {
    await use((label) => {
      sequence += 1;
      return `${testConfig.resourcePrefix}${label}-${sequence}`;
    });
  },
});

export { expect };

/** 프로젝트마다 기본으로 있는 네트워크·보안 그룹 ID */
export const defaults = {
  networkId: `net-default-${testConfig.projectId}`,
  securityGroupId: `sg-default-${testConfig.projectId}`,
};
