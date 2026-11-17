import { ConsolePage } from '../pages/ConsolePage';
import { expect, test as apiTest } from './api';

interface UiOptions {
  /** 콘솔에 로그인할 계정. 기본은 관리자다. */
  consoleUser: 'admin' | 'member';
}

interface UiFixtures {
  /**
   * 로그인된 콘솔. 화면에서 매번 로그인하지 않고, 스위트당 한 번 받은 토큰을 쿠키로 넣어 재사용한다.
   * 테스트가 끝나면 api fixture가 남은 리소스를 일괄 삭제한다.
   */
  console: ConsolePage;
}

export const test = apiTest.extend<UiOptions & UiFixtures>({
  consoleUser: ['admin', { option: true }],

  console: async ({ page, context, baseURL, api, memberApi, consoleUser }, use) => {
    const client = consoleUser === 'admin' ? api : memberApi;
    // 토큰이 만료됐다면 이 요청에서 다시 로그인되어 새 토큰으로 바뀐다.
    await client.expectOk('GET', '/auth/me');
    await context.addCookies([{ name: 'portal_token', value: client.session.token ?? '', url: baseURL }]);

    const consolePage = new ConsolePage(page);
    await consolePage.goto();
    await use(consolePage);
  },
});

export { expect };
export { defaults } from './api';
