import { test, expect } from '../../../fixtures/base-test';
import { buildVolumeName, DEFAULT_VOLUME_SIZE_GIB } from '../../../data/volume-test-data';
import { logStep } from '../../../utils/test-logger';

/**
 * 대표 시나리오 (원본 Storage/Cinder lifecycle 흐름을 일반화)
 *
 * Auth(storageState) → Navigate → Create → Wait Active → Validate → Evidence → Delete
 *
 * 실 Cloud UI(BASE_URL)가 연결되어 있을 때만 실행됩니다.
 */
test.describe('Volume lifecycle', () => {
  test.beforeEach(() => {
    test.skip(
      !process.env.BASE_URL || process.env.BASE_URL.includes('example.com'),
      '실환경 BASE_URL이 필요합니다. Public 실행은 npm run test:demo 를 사용하세요.',
    );
  });

  test('create → active → evidence → delete', async ({ volumePage, evidence, page }) => {
    const name = buildVolumeName();
    logStep(`create volume ${name}`);

    await volumePage.openVolumes();
    await volumePage.createVolume(name, DEFAULT_VOLUME_SIZE_GIB);
    await volumePage.waitUntilActive(name);
    await expect(volumePage.volumeRow(name)).toContainText(/Active|ACTIVE/i);
    await evidence.capture('volume-active');
    await volumePage.deleteVolume(name);
    await evidence.capture('volume-deleted');
    await expect(page.getByText(name)).toHaveCount(0);
  });
});
