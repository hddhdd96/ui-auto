import type { LoginPage } from '../../pages/auth/LoginPage';

export const DEMO_USER = 'demo-user';
export const DEMO_PASSWORD = 'demo-password';

export async function loginAsDemo(loginPage: LoginPage): Promise<void> {
  await loginPage.login(DEMO_USER, DEMO_PASSWORD);
}
