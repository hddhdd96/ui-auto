import { createInstanceAndWait, waitUntilSettled } from '../../src/api/actions';
import { defaults, expect, test } from '../../src/fixtures/ui';

/**
 * 결함 재현: 쿼터 초과 API 우회
 * 실무 사례와 같은 원인 구조로 만든 가상 시나리오다.
 *   - 화면은 쿼터를 넘는 인스턴스 생성을 막는다(UI-QUOTA-001에서 확인).
 *   - 하지만 API로 직접 요청하면 접수되고, 인스턴스가 ERROR 상태로 생성된다.
 *   - ERROR 인스턴스가 사용량에 집계되면서 대시보드의 사용량이 쿼터를 넘는다.
 * 정상 모드에서는 모두 통과하고, DEFECT_QUOTA_API_BYPASS=true에서는 아래 테스트가 결함을 검출해 실패해야 한다.
 */
test.describe('결함 재현: 쿼터 초과 API 우회', () => {
  test.beforeEach(async ({ api, uniqueName }) => {
    // vCPU 쿼터 16을 꽉 채운다(xlarge 8 vCPU × 2).
    await createInstanceAndWait(api, { name: uniqueName('full'), flavorId: 'xlarge', networkId: defaults.networkId });
    await createInstanceAndWait(api, { name: uniqueName('full'), flavorId: 'xlarge', networkId: defaults.networkId });
  });

  test('DEF-QUOTA-001 쿼터를 넘는 인스턴스 생성을 API로 요청하면 409로 거부되고, 목록에 인스턴스가 생기지 않는다', async ({ api, uniqueName }) => {
    const name = uniqueName('over');

    const result = await api.createInstance({ name, flavorId: 'small', networkId: defaults.networkId });

    // 응답과 실제 결과를 함께 본다. 결함이 있으면 202가 오고, 잠시 뒤 ERROR 인스턴스가 남는다.
    const created = (await api.instances()).find((i) => i.name === name);
    if (created) await waitUntilSettled(api, 'instances', created.id);
    const actual = (await api.instances()).find((i) => i.name === name);
    expect({ status: result.status, code: result.error?.code, createdStatus: actual?.status ?? '생성되지 않음' }).toEqual({
      status: 409, code: 'QUOTA_EXCEEDED', createdStatus: '생성되지 않음',
    });
  });

  test('DEF-QUOTA-002 쿼터 초과 요청이 API로 들어와도 대시보드 사용량은 쿼터를 넘지 않고, 인스턴스 목록에 ERROR가 없다', async ({ console, api, uniqueName }) => {
    // 화면에서는 막히는 요청을 API로 보낸다. 응답이 무엇이든 실제 작업이 끝날 때까지 기다린다.
    const result = await api.createInstance({ name: uniqueName('over'), flavorId: 'small', networkId: defaults.networkId });
    if (result.ok) await waitUntilSettled(api, 'instances', result.body.id);

    const dashboard = await console.openDashboard();
    const quota = await api.quota();
    await expect(dashboard.quota('vCPU')).toHaveText(String(quota.vcpus));
    const usedVcpus = Number(await dashboard.used('vCPU').textContent());
    expect(usedVcpus, '대시보드의 vCPU 사용량은 쿼터를 넘을 수 없다').toBeLessThanOrEqual(quota.vcpus);
    await expect(dashboard.used('인스턴스 수')).toHaveText('2');

    const instances = await console.openInstances();
    await expect(instances.table.getByText('ERROR', { exact: true })).toHaveCount(0);
  });
});
