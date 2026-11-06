import { test, expect } from '../../fixtures/base-test';
import { createInstanceAndAssertActive } from '../steps/instance-create';

/**
 * TC-INST-003: Cloud View / product tour 방해 오버레이를 allowlist healing으로 제거한 뒤 생성한다.
 * assertion·timeout·retry는 그대로 유지한다.
 */
test('TC-INST-003 heal disruptive overlays then create', async ({
  loginPage,
  instanceListPage,
  instanceCreatePage,
}) => {
  const name = `qa-overlay-${Date.now()}`;
  await createInstanceAndAssertActive({
    loginPage,
    instanceListPage,
    instanceCreatePage,
    name,
    flavor: 'm1.small',
    overlays: true,
  });

  const dismissed = instanceListPage
    .healingReport()
    .actions.filter((item) => item.kind === 'dismiss-overlay')
    .map((item) => (item.kind === 'dismiss-overlay' ? item.role : ''));

  expect(dismissed).toEqual(expect.arrayContaining(['cloud-view-banner', 'product-tour']));
});
