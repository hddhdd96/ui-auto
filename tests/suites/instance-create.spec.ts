import { test, expect } from '../../fixtures/base-test';
import { DEMO_PASSWORD, DEMO_USER } from '../steps/auth';
import { createInstanceAndAssertActive, openCreateForm } from '../steps/instance-create';

/**
 * Suite: Instance Create
 * 그룹 TC-ID: TC-AUTH-001, TC-INST-001, TC-INST-002, TC-INST-003
 *
 * 개별 TC 파일(tests/tc/)과 동일한 스텝을 재사용해 시나리오 단위로 묶는다.
 */
const SUITE_TC_IDS = ['TC-AUTH-001', 'TC-INST-001', 'TC-INST-002', 'TC-INST-003'] as const;

test.describe('Suite: Instance Create', () => {
  test('suite covers expected TC-ID list', () => {
    expect(SUITE_TC_IDS).toEqual(['TC-AUTH-001', 'TC-INST-001', 'TC-INST-002', 'TC-INST-003']);
  });

  test('TC-AUTH-001 login redirects to instances', async ({ loginPage, page }) => {
    await loginPage.login(DEMO_USER, DEMO_PASSWORD);
    await expect(page).toHaveURL(/\/instances/);
  });

  test('TC-INST-001 open create instance form', async ({ loginPage, instanceListPage, page }) => {
    await openCreateForm(loginPage, instanceListPage);
    await expect(page.getByRole('dialog', { name: 'Create instance', exact: true })).toBeVisible();
  });

  test('TC-INST-002 create instance becomes ACTIVE', async ({
    loginPage,
    instanceListPage,
    instanceCreatePage,
  }) => {
    await createInstanceAndAssertActive({
      loginPage,
      instanceListPage,
      instanceCreatePage,
      name: `suite-inst-${Date.now()}`,
      flavor: 'm1.tiny',
    });
  });

  test('TC-INST-003 heal disruptive overlays then create', async ({
    loginPage,
    instanceListPage,
    instanceCreatePage,
  }) => {
    await createInstanceAndAssertActive({
      loginPage,
      instanceListPage,
      instanceCreatePage,
      name: `suite-overlay-${Date.now()}`,
      flavor: 'm1.small',
      overlays: true,
    });
    const roles = instanceListPage
      .healingReport()
      .actions.filter((item) => item.kind === 'dismiss-overlay')
      .map((item) => (item.kind === 'dismiss-overlay' ? item.role : ''));
    expect(roles).toEqual(expect.arrayContaining(['cloud-view-banner', 'product-tour']));
  });
});
