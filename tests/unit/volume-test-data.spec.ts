import { test, expect } from '@playwright/test';
import { buildVolumeName } from '../../data/volume-test-data';

test('buildVolumeName includes prefix and unique suffix', () => {
  const name = buildVolumeName('qa-');
  expect(name.startsWith('qa-volume-')).toBeTruthy();
  expect(name.length).toBeGreaterThan(12);
});

test('names remain unique when created during the same clock tick', () => {
  const names = Array.from({ length: 100 }, () => buildVolumeName('qa'));
  expect(new Set(names).size).toBe(names.length);
  expect(names.every(name => name.startsWith('qa-volume-'))).toBe(true);
});
