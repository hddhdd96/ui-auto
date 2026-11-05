import { test, expect } from '../../fixtures/base-test';
import { DEMO_PASSWORD, DEMO_USER } from '../steps/auth';

/**
 * TC-AUTH-001: 데모 계정으로 로그인하면 Instances 화면으로 이동한다.
 */
test('TC-AUTH-001 login redirects to instances', async ({ loginPage, page }) => {
  await loginPage.login(DEMO_USER, DEMO_PASSWORD);
  await expect(page).toHaveURL(/\/instances/);
  await expect(page.getByRole('heading', { name: 'Instances', exact: true })).toBeVisible();
});
