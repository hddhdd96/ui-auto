import { createInstanceAndWait } from '../../../src/api/actions';
import { defaults, expect, test } from '../../../src/fixtures/flaky';

/**
 * [개선 전 테스트] ④ 환경·네트워크 오류: 네트워크 끊김
 * 실무 원인: 네트워크 변경 오류(ERR_NETWORK_CHANGED)로 테스트가 중단됐고, 이를 제품 실패와 구분하지 못했다.
 * 이 파일은 네트워크 오류를 다른 실패와 똑같이 다룬다(다시 시도하지 않고, 원인도 남기지 않는다).
 * FLAKY_NETWORK=true에서 간헐적으로 실패한다.
 */
test('FLAKY-NET-001 API로 만든 인스턴스가 ACTIVE가 되면 화면 목록에도 ACTIVE로 표시된다', async ({ console, api, uniqueName }) => {
  const instance = await createInstanceAndWait(api, { name: uniqueName('web'), flavorId: 'small', networkId: defaults.networkId });

  const instances = await console.openInstances();

  await expect(instances.status(instance.name)).toHaveText('ACTIVE');
});
