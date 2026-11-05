import { test } from '../../fixtures/base-test';
import { createInstanceAndAssertActive } from '../steps/instance-create';

/**
 * TC-INST-002: 인스턴스를 생성하고 ACTIVE 상태를 엄격 검증한다.
 */
test('TC-INST-002 create instance becomes ACTIVE', async ({
  loginPage,
  instanceListPage,
  instanceCreatePage,
}) => {
  const name = `qa-inst-${Date.now()}`;
  await createInstanceAndAssertActive({
    loginPage,
    instanceListPage,
    instanceCreatePage,
    name,
    flavor: 'm1.tiny',
  });
});
