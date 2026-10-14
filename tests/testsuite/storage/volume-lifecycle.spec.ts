import { test } from '../../../fixtures/base-test';
import { buildVolumeName, DEFAULT_VOLUME_SIZE_GIB } from '../../../data/volume-test-data';

test('volume creation is reflected in API and UI, then deletion is confirmed', {
  annotation: { type: 'tc-id', description: 'DEMO-VOL-001' },
}, async ({ volumeLifecycle, evidence }) => {
  const name = buildVolumeName();
  await volumeLifecycle.createAndVerify(name, DEFAULT_VOLUME_SIZE_GIB);
  await evidence.capture('volume-active');
  await volumeLifecycle.deleteAndVerify(name);
  await evidence.capture('volume-deleted');
});
