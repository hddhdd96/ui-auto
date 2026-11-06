import { test as base } from '@playwright/test';
import { LoginPage } from '../pages/auth/LoginPage';
import { InstanceListPage } from '../pages/compute/InstanceListPage';
import { InstanceCreatePage } from '../pages/compute/InstanceCreatePage';

type AppFixtures = {
  loginPage: LoginPage;
  instanceListPage: InstanceListPage;
  instanceCreatePage: InstanceCreatePage;
};

export const test = base.extend<AppFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  instanceListPage: async ({ page }, use) => {
    await use(new InstanceListPage(page));
  },
  instanceCreatePage: async ({ page }, use) => {
    await use(new InstanceCreatePage(page));
  },
});

export { expect } from '@playwright/test';
