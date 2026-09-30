import { test as base } from '@playwright/test';
import { VolumePage } from '../pages/storage/VolumePage';
import { InstancePage } from '../pages/compute/InstancePage';
import { LoginPage } from '../pages/auth/LoginPage';
import { EvidenceRecorder } from '../utils/evidence-recorder';

type AppFixtures = {
  volumePage: VolumePage;
  instancePage: InstancePage;
  loginPage: LoginPage;
  evidence: EvidenceRecorder;
};

/**
 * 원본 product/*/fixtures.ts의 test.extend 패턴.
 * Page Object·증적 헬퍼를 주입한다.
 */
export const test = base.extend<AppFixtures>({
  volumePage: async ({ page }, use) => {
    await use(new VolumePage(page));
  },
  instancePage: async ({ page }, use) => {
    await use(new InstancePage(page));
  },
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  evidence: async ({ page }, use, testInfo) => {
    const recorder = new EvidenceRecorder(page, testInfo);
    await use(recorder);
  },
});

export { expect } from '@playwright/test';
