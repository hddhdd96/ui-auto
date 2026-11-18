import { waitForStatus } from '../../../src/api/actions';
import { expect, test } from '../../../src/fixtures/flaky';

/**
 * [개선 후 테스트] ③ UI 반영 지연
 * 개선 내용:
 *   - 실제 상태는 API로 확인한다. 목록 API에서 AVAILABLE이 될 때까지 폴링한다.
 *   - 그다음 메뉴로 목록 화면을 다시 열어 최신 데이터를 받고, 화면에 기대한 상태가 나타날 때까지 조건부로 기다린다.
 *   - 고정 시간 대기는 쓰지 않는다.
 * FLAKY_UI_STALE=true에서도 항상 통과해야 한다.
 */
test('FLAKY-UI-001 화면에서 볼륨을 만들면 목록에 AVAILABLE로 표시된다', async ({ console, api, uniqueName }) => {
  const name = uniqueName('data');
  const volumes = await console.openVolumes();

  await volumes.create(name, 10);
  await expect(console.message).toHaveText(`${name} 생성을 요청했습니다.`);

  const created = (await api.volumes()).find((v) => v.name === name);
  expect(created, '목록 API에서 만든 볼륨').toBeDefined();
  await waitForStatus(api, 'volumes', created!.id, 'AVAILABLE');

  // 같은 메뉴를 다시 눌러도 주소가 그대로라 화면이 다시 그려지지 않으므로, 대시보드를 거쳐 다시 연다.
  await console.openDashboard();
  const refreshed = await console.openVolumes();
  await expect(refreshed.status(name)).toHaveText('AVAILABLE');
});
