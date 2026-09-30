import { test, expect } from '@playwright/test';
import { buildVolumeName } from '../../data/volume-test-data';

test('buildVolumeName includes prefix and stamp', () => {
  const name = buildVolumeName('qa-');
  expect(name.startsWith('qa-volume-')).toBeTruthy();
  expect(name.length).toBeGreaterThan(12);
});
