import { test as setup, expect } from '@playwright/test';
import path from 'node:path';
import { LoginPage } from '../pages/auth/LoginPage';

const authFile = path.join(__dirname, 'storageState.json');

/**
 * 원본 global-setup과 동일: 한 번 로그인 후 storageState 저장.
 * 대상 시스템이 없으면 스킵하고 빈 상태를 저장한다.
 */
setup('authenticate', async ({ page }) => {
  const base = process.env.BASE_URL ?? '';
  const user = process.env.USERNAME ?? '';
  const pass = process.env.PASSWORD ?? '';

  if (!base || base.includes('example.com') || !user || pass === 'replace-me') {
    await page.context().storageState({ path: authFile });
    setup.skip(true, '실환경 BASE_URL/USERNAME/PASSWORD가 없어 auth setup을 건너뜁니다.');
    return;
  }

  const login = new LoginPage(page);
  await login.login(user, pass);
  await expect(page).not.toHaveURL(/login/i);
  await page.context().storageState({ path: authFile });
});
