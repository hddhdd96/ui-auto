import { ApiClient, newSession } from '../../src/api/client';
import { testConfig } from '../../src/config';
import { expect, test } from '../../src/fixtures/api';

test.describe('인증과 환경 조회', () => {
  test('API-ENV-001 로그인 없이 환경 목록을 조회하고, 로그인 후 프로젝트와 사양을 조회한다', async ({ api, apiContext }) => {
    const environments = await (await apiContext.get('/api/environments')).json();
    expect(environments).toEqual([expect.objectContaining({ id: 'local', baseUrl: expect.stringMatching(/^http/) })]);

    expect((await api.projects()).map((p) => p.id)).toEqual(['proj-alpha', 'proj-beta']);
    expect((await api.flavors()).map((f) => f.id)).toEqual(['small', 'medium', 'large', 'xlarge']);
  });

  test('API-AUTH-001 일반 사용자는 자신이 속한 프로젝트만 조회한다', async ({ memberApi }) => {
    expect((await memberApi.projects()).map((p) => p.id)).toEqual(['proj-alpha']);
  });

  test('API-AUTH-002 토큰 없이 요청하면 401 UNAUTHENTICATED로 거부한다', async ({ playwright, baseURL }) => {
    // 공용 컨텍스트에는 로그인 쿠키가 남아 있으므로, 쿠키가 없는 새 컨텍스트로 요청한다.
    const anonymous = await playwright.request.newContext({ baseURL });
    const response = await anonymous.get('/api/instances');
    expect(response.status()).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHENTICATED');
    await anonymous.dispose();
  });

  test('API-AUTH-003 쓰던 토큰이 무효가 되면 다시 로그인해서 요청을 이어간다', async ({ apiContext, evidence }) => {
    // 다른 테스트의 세션에 영향을 주지 않도록 이 테스트만의 세션을 쓴다.
    const session = newSession(testConfig.admin, testConfig.projectId);
    const client = new ApiClient(apiContext, session, evidence);
    await client.login();
    const firstToken = session.token;
    await client.expectOk('POST', '/auth/logout');

    const flavors = await client.flavors();

    expect(flavors).toHaveLength(4);
    expect(session.loginCount).toBe(2);
    expect(session.token).not.toBe(firstToken);
    // 증적에는 401과 재로그인, 재요청이 순서대로 남는다.
    expect(evidence.http.slice(-3).map((r) => `${r.method} ${r.path} ${r.status}`)).toEqual([
      'GET /flavors 401', 'POST /auth/login 200', 'GET /flavors 200',
    ]);
  });
});
