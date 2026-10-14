import { test, expect } from '../../fixtures/base-test';
import { buildVolumeName, DEFAULT_VOLUME_SIZE_GIB } from '../../data/volume-test-data';

test('a lost post-create observation still permits backend cleanup', {
  annotation: { type: 'tc-id', description: 'DEMO-VOL-002' },
}, async ({ volumePage, volumeClient, resources, evidence }) => {
  const name = buildVolumeName();
  const observationError = new Error('Synthetic observation failure after successful submission');
  let captured: unknown;
  await volumePage.openVolumes();
  resources.register(name);
  try {
    await volumePage.createVolume(name, DEFAULT_VOLUME_SIZE_GIB);
    await volumeClient.expectReady(name, DEFAULT_VOLUME_SIZE_GIB);
    throw observationError;
  } catch (error) {
    captured = error;
  } finally {
    await resources.cleanup();
  }
  expect(captured, 'The original observation error must not disappear').toBe(observationError);
  expect(await volumeClient.findByName(name)).toBeUndefined();
  await volumePage.openVolumes();
  await volumePage.expectDeleted(name);
  await evidence.capture('uncertain-create-cleaned');
});
