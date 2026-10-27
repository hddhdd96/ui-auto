/*
 * 실패 원인 분류 실험(triage-lab) 전용 시나리오입니다. `npm test`에는 포함되지 않으며
 * `npm run triage:lab`에서만 실행됩니다. 각 시나리오의 의도와 정답 분류는 triage-lab/cases.ts에 있습니다.
 */
import { test, expect } from '../../fixtures/base-test';
import { buildVolumeName, DEFAULT_VOLUME_SIZE_GIB } from '../../data/volume-test-data';

test('create dialog opens from the volume list', {
  tag: '@reg-01', annotation: { type: 'tc-id', description: 'REG-01' },
}, async ({ page, volumePage }) => {
  await volumePage.openVolumes();
  await page.getByRole('button', { name: 'Create Volume', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Create volume' })).toBeVisible();
});

test('created volume shows the requested size', {
  tag: '@reg-02', annotation: { type: 'tc-id', description: 'REG-02' },
}, async ({ volumePage, resources }) => {
  const name = buildVolumeName();
  const requestedSizeGiB = 20;
  await volumePage.openVolumes();
  resources.register(name);
  await volumePage.createVolume(name, DEFAULT_VOLUME_SIZE_GIB);
  resources.markCreated(name);
  await volumePage.expectSize(name, requestedSizeGiB);
});

test('a volume can be deleted from the list', {
  tag: '@reg-03', annotation: { type: 'tc-id', description: 'REG-03' },
}, async ({ page, volumePage, resources }) => {
  const names = [buildVolumeName(), buildVolumeName()];
  await volumePage.openVolumes();
  for (const name of names) {
    resources.register(name);
    await volumePage.createVolume(name, DEFAULT_VOLUME_SIZE_GIB);
    resources.markCreated(name);
  }
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('dialog', { name: 'Delete volume' })).toBeVisible();
});

test('two volumes can be created in sequence', {
  tag: '@reg-04', annotation: { type: 'tc-id', description: 'REG-04' },
}, async ({ volumePage, resources }) => {
  const name = 'qa-volume-regression';
  await volumePage.openVolumes();
  resources.register(name);
  await volumePage.createVolume(name, DEFAULT_VOLUME_SIZE_GIB);
  resources.markCreated(name);
  await volumePage.createVolume(name, DEFAULT_VOLUME_SIZE_GIB);
});

test('volume list API returns the created volume', {
  tag: '@reg-05', annotation: { type: 'tc-id', description: 'REG-05' },
}, async ({ page, volumePage, resources }) => {
  const name = buildVolumeName();
  await volumePage.openVolumes();
  resources.register(name);
  await volumePage.createVolume(name, DEFAULT_VOLUME_SIZE_GIB);
  resources.markCreated(name);
  const response = await page.request.get('/api/v1/volume', { params: { name } });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual([expect.objectContaining({ name })]);
});

test('created volume becomes active', {
  tag: '@reg-06', annotation: { type: 'tc-id', description: 'REG-06' },
}, async ({ volumePage, resources }) => {
  const name = buildVolumeName();
  await volumePage.openVolumes();
  resources.register(name);
  await volumePage.createVolume(name, DEFAULT_VOLUME_SIZE_GIB);
  resources.markCreated(name);
  await expect(volumePage.volumeRow(name).getByTestId('volume-status')).toHaveText('Active');
});

test('smallest volume can be created', {
  tag: '@reg-07', annotation: { type: 'tc-id', description: 'REG-07' },
}, async ({ volumePage, resources }) => {
  const name = buildVolumeName();
  const sizeGiB = 0;
  await volumePage.openVolumes();
  resources.register(name);
  await volumePage.createVolume(name, sizeGiB);
  resources.markCreated(name);
});
