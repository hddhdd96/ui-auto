import { createVolumeAndWait, createVolumeGroupAndWait } from '../../../src/api/actions';
import { waitForNextResponse } from '../../../src/flaky/network';
import { expect, test } from '../../../src/fixtures/flaky';

/**
 * [개선 전 테스트] ① 실제 리소스 상태 불일치
 * 실무 원인: 삭제 API는 성공을 돌려줬지만 리소스는 DELETING으로 한동안 남아 있었고,
 *           이후 늦게 온 HTTP 400을 무조건 실패로 처리해 결과가 회차마다 달랐다.
 * 이 파일은 그때의 판정 방식을 그대로 옮긴 것이다. FLAKY_DELETE_LAG=true에서 간헐적으로 실패한다.
 */
test('FLAKY-DEL-001 볼륨 그룹을 화면에서 삭제하면 그룹이 사라지고 볼륨이 그룹에서 풀려난다', async ({ console, api, page, uniqueName, browserResponses }) => {
  const first = await createVolumeAndWait(api, { name: uniqueName('vol'), sizeGb: 10 });
  const second = await createVolumeAndWait(api, { name: uniqueName('vol'), sizeGb: 10 });
  const group = await createVolumeGroupAndWait(api, { name: uniqueName('vg'), volumeIds: [first.id, second.id] });
  const groups = await console.openVolumeGroups();

  const response = waitForNextResponse(page, 'DELETE');
  await groups.delete(group.name);

  // 개선 전: 삭제 응답이 성공이면 작업이 끝났다고 본다.
  expect((await response).status(), '삭제 응답').toBe(200);
  // 개선 전: 평소 삭제가 끝나던 시간보다 넉넉하다고 생각한 1초를 기다린 뒤 결과를 본다.
  await page.waitForTimeout(1000);
  expect((await api.volumeGroups()).map((g) => g.id), '삭제 후 볼륨 그룹 목록').not.toContain(group.id);
  expect((await api.volumes()).filter((v) => v.groupId !== null), '그룹에 묶인 볼륨').toEqual([]);
  // 개선 전: 테스트 중에 4xx 응답이 하나라도 오면 실패로 본다.
  expect(browserResponses.filter((r) => r.status >= 400).map((r) => `${r.method} ${r.path} ${r.status}`), '4xx 응답').toEqual([]);
});
