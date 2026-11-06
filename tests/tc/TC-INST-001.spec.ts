import { test, expect } from '../../fixtures/base-test';
import { openCreateForm } from '../steps/instance-create';

/**
 * TC-INST-001: Create instance 폼을 연다 (scroll-into-view healing 포함).
 */
test('TC-INST-001 open create instance form', async ({ loginPage, instanceListPage, page }) => {
  await openCreateForm(loginPage, instanceListPage);
  await expect(page.getByRole('dialog', { name: 'Create instance', exact: true })).toBeVisible();

  const actions = instanceListPage.healingReport().actions.map((item) => item.kind);
  expect(actions).toContain('scroll-into-view');
});
