import { testConfig } from '../../src/config';
import { expect, test } from '../../src/fixtures/ui';
import { ConsolePage } from '../../src/pages/ConsolePage';
import { DashboardPage } from '../../src/pages/DashboardPage';
import { LoginPage } from '../../src/pages/LoginPage';

test.describe('로그인과 세션', () => {
  test('UI-AUTH-001 올바른 계정으로 로그인하면 대시보드가 열리고 사용자 이름이 표시된다', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await login.login(testConfig.admin.username, testConfig.admin.password);

    await expect(new DashboardPage(page).heading).toBeVisible();
    await expect(new ConsolePage(page).userName).toHaveText('포털 관리자 (관리자)');
  });

  test('UI-AUTH-002 비밀번호가 틀리면 오류 메시지를 보여주고 로그인 화면에 머문다', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await login.login(testConfig.admin.username, 'wrong-password');

    await expect(login.error).toHaveText('아이디 또는 비밀번호가 올바르지 않습니다.');
    await expect(login.submit).toBeVisible();
    await expect(new DashboardPage(page).heading).toBeHidden();
  });

  test('UI-AUTH-003 로그아웃하면 로그인 화면으로 돌아가고, 쓰던 토큰으로는 API를 호출할 수 없다', async ({ page, playwright, baseURL }) => {
    // 다른 테스트가 함께 쓰는 세션을 끊지 않도록 화면에서 새로 로그인한 세션으로 확인한다.
    const login = new LoginPage(page);
    await login.goto();
    await login.login(testConfig.admin.username, testConfig.admin.password);
    const console = new ConsolePage(page);
    await expect(console.userName).toBeVisible();
    const token = (await page.context().cookies()).find((c) => c.name === 'portal_token')?.value;
    expect(token).toBeTruthy();

    await console.logout();

    await expect(login.submit).toBeVisible();
    const anonymous = await playwright.request.newContext({ baseURL });
    const response = await anonymous.get('/api/instances', { headers: { authorization: `Bearer ${token}` } });
    expect(response.status()).toBe(401);
    await anonymous.dispose();
  });

  test('UI-SESSION-001 세션 연장을 누르면 연장 안내가 나오고 이후에도 화면을 계속 쓸 수 있다', async ({ console }) => {
    await console.extendSession();

    await expect(console.message).toHaveText('세션을 연장했습니다.');
    const instances = await console.openInstances();
    await expect(instances.table).toBeVisible();
  });
});
