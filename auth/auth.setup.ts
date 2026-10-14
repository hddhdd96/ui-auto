import { test as setup } from '@playwright/test';
import path from 'node:path';
import { LoginPage } from '../pages/auth/LoginPage';

setup('authenticate with a confirmed signed-in user', async ({ page }) => {
  const localDemo = !process.env.BASE_URL;
  const user = localDemo ? 'demo-user' : process.env.USERNAME;
  const password = localDemo ? 'demo-password' : process.env.PASSWORD;
  if (!user || !password || password === 'replace-me') {
    throw new Error('Set USERNAME/PASSWORD for the target contract; missing authentication is not a PASS.');
  }
  await new LoginPage(page).login(user, password);
  await page.context().storageState({ path: path.join(__dirname, 'storageState.json') });
});
