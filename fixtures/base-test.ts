import { test as base } from '@playwright/test';
import { VolumePage } from '../pages/storage/VolumePage';
import { InstancePage } from '../pages/compute/InstancePage';
import { LoginPage } from '../pages/auth/LoginPage';
import { EvidenceRecorder } from '../utils/evidence-recorder';
import { ResourceCleanup } from '../utils/resource-cleanup';
import { VolumeClient } from '../services/volume-client';
import { VolumeLifecycle } from '../flows/volume-lifecycle';

type AppFixtures = {
  volumePage: VolumePage;
  instancePage: InstancePage;
  loginPage: LoginPage;
  evidence: EvidenceRecorder;
  volumeClient: VolumeClient;
  resources: ResourceCleanup;
  volumeLifecycle: VolumeLifecycle;
};

// Product-style fixture injection without copying environment-specific code.
export const test = base.extend<AppFixtures>({
  volumePage: async ({ page }, use) => { await use(new VolumePage(page)); },
  instancePage: async ({ page }, use) => { await use(new InstancePage(page)); },
  loginPage: async ({ page }, use) => { await use(new LoginPage(page)); },
  volumeClient: async ({ page }, use) => { await use(new VolumeClient(page.request)); },
  evidence: async ({ page }, use, testInfo) => { await use(new EvidenceRecorder(page, testInfo)); },
  resources: async ({ volumeClient }, use, testInfo) => {
    const resources = new ResourceCleanup(name => volumeClient.deleteByName(name));
    await use(resources);
    try {
      await resources.cleanup();
    } finally {
      await testInfo.attach('resource-lifecycle', {
        body: JSON.stringify(resources.snapshot(), null, 2), contentType: 'application/json',
      });
    }
  },
  volumeLifecycle: async ({ volumePage, volumeClient, resources }, use) => {
    await use(new VolumeLifecycle(volumePage, volumeClient, resources));
  },
});
export { expect } from '@playwright/test';
