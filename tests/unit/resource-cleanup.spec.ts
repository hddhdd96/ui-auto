import { test, expect } from '@playwright/test';
import { ResourceCleanup } from '../../utils/resource-cleanup';

test('uncertain creation is cleaned while untouched resources are never deleted', async () => {
  const removed: string[] = [];
  const resources = new ResourceCleanup(async name => { removed.push(name); });
  resources.register('owned-resource');
  await resources.cleanup();
  expect(removed).toEqual(['owned-resource']);
  expect(resources.snapshot()).toEqual([{ name: 'owned-resource', state: 'deleted' }]);
});

test('cleanup keeps failed resources and does not silently retry deletion', async () => {
  const removed: string[] = [];
  const resources = new ResourceCleanup(async name => {
    removed.push(name);
    if (name === 'failure') throw new Error('Synthetic delete error');
  });
  resources.register('failure'); resources.register('success');
  await expect(resources.cleanup()).rejects.toThrow('Unresolved cleanup: failure');
  expect(resources.snapshot()).toEqual([
    { name: 'failure', state: 'attempting', error: 'Synthetic delete error' },
    { name: 'success', state: 'deleted' },
  ]);
  await expect(resources.cleanup()).rejects.toThrow('Unresolved cleanup: failure');
  expect(removed).toEqual(['failure', 'success']);
});

test('a prior UI deletion failure is retained without a second API delete', async () => {
  const removed: string[] = [];
  const resources = new ResourceCleanup(async name => { removed.push(name); });
  resources.register('owned-resource');
  resources.markCreated('owned-resource');
  resources.recordDeletionFailure('owned-resource', new Error('UI delete was not confirmed'));
  await expect(resources.cleanup()).rejects.toThrow('Unresolved cleanup: owned-resource');
  expect(removed).toEqual([]);
  expect(resources.snapshot()).toEqual([
    { name: 'owned-resource', state: 'created', error: 'UI delete was not confirmed' },
  ]);
});
