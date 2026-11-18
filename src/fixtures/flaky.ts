import type { ObservedResponse } from '../flaky/network';
import { recordBrowserResponses } from '../flaky/network';
import { expect, test as uiTest } from './ui';

interface FlakyFixtures {
  /** 콘솔(브라우저)이 받은 API 응답 기록. console fixture보다 먼저 붙여 첫 화면의 응답부터 남긴다. */
  browserResponses: ObservedResponse[];
}

export const test = uiTest.extend<FlakyFixtures>({
  browserResponses: [async ({ page, evidence }, use, testInfo) => {
    const observed = recordBrowserResponses(page, evidence);
    await use(observed);
    if (testInfo.status !== testInfo.expectedStatus) {
      // 실패했을 때 포털이 주입한 Flaky 이력을 함께 남긴다. 실패 원인 분류(환경/제품)의 근거가 된다.
      const response = await page.request.get('/api/test/flaky-events');
      await testInfo.attach('flaky-events.json', { body: await response.text(), contentType: 'application/json' });
    }
  }, { auto: true }],
});

export { expect };
export { defaults } from './api';
