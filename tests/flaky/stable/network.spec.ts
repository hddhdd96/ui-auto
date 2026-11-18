import { createInstanceAndWait } from '../../../src/api/actions';
import { openScreenWithRecovery } from '../../../src/flaky/recovery';
import { defaults, expect, test } from '../../../src/fixtures/flaky';
import { InstancesPage } from '../../../src/pages/InstancesPage';

/**
 * [개선 후 테스트] ④ 환경·네트워크 오류: 네트워크 끊김
 * 개선 내용:
 *   - 조회 요청이 네트워크 오류로 끝나면 원인을 env로 기록하고 다시 보낸다(flaky-stable 프로젝트의 networkRetries: 3).
 *     조회는 여러 번 보내도 결과가 같으므로 재시도해도 판정이 바뀌지 않는다.
 *   - 화면이 네트워크 오류로 열리지 않으면 env로 기록하고 다시 연다. 네트워크 오류가 아닌 오류는 product로 기록하고 바로 실패한다.
 *   - 회복하지 못한 env 오류는 '[env]'를 붙여 실패시켜, 제품 결함과 구분되게 한다.
 * FLAKY_NETWORK=true에서도 항상 통과해야 한다.
 */
test('FLAKY-NET-001 API로 만든 인스턴스가 ACTIVE가 되면 화면 목록에도 ACTIVE로 표시된다', async ({ console, api, page, evidence, uniqueName }) => {
  const instance = await createInstanceAndWait(api, { name: uniqueName('web'), flavorId: 'small', networkId: defaults.networkId });

  const instances = await openScreenWithRecovery(console, new InstancesPage(page), evidence);

  await expect(instances.status(instance.name)).toHaveText('ACTIVE');
  expect(evidence.causes.filter((c) => !c.recovered), '회복하지 못한 문제').toEqual([]);
});
