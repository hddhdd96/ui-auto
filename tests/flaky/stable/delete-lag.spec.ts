import { createVolumeAndWait, createVolumeGroupAndWait, waitForGone } from '../../../src/api/actions';
import { waitForOwnResponse } from '../../../src/flaky/network';
import { expect, test } from '../../../src/fixtures/flaky';

/**
 * [개선 후 테스트] ① 실제 리소스 상태 불일치
 * 개선 내용:
 *   - 삭제 응답은 '접수'로만 본다. 이 단계에서 보낸 DELETE(메서드·URL·리소스 ID)의 응답만 짝지어 해석한다.
 *   - 응답이 400이면 바로 실패 처리하지 않고, 목록 API로 리소스가 실제로 남아 있는지 다시 확인한다.
 *   - 완료 판정은 목록 API에서 대상이 사라질 때까지 폴링해서 한다. ERROR·FAILED가 보이면 기다리지 않고 바로 실패한다.
 * FLAKY_DELETE_LAG=true에서도 항상 통과해야 한다.
 */
test('FLAKY-DEL-001 볼륨 그룹을 화면에서 삭제하면 그룹이 사라지고 볼륨이 그룹에서 풀려난다', async ({ console, api, page, uniqueName }) => {
  const first = await createVolumeAndWait(api, { name: uniqueName('vol'), sizeGb: 10 });
  const second = await createVolumeAndWait(api, { name: uniqueName('vol'), sizeGb: 10 });
  const group = await createVolumeGroupAndWait(api, { name: uniqueName('vg'), volumeIds: [first.id, second.id] });
  const groups = await console.openVolumeGroups();

  const ownResponse = waitForOwnResponse(page, 'DELETE', `/volume-groups/${group.id}`);
  await groups.delete(group.name);
  const response = await ownResponse;

  if (!response.ok()) {
    // 응답만으로는 결과를 알 수 없다. 목록 API로 실제 상태를 확인한다(이미 없거나 DELETING이면 삭제가 진행 중이다).
    const actual = (await api.volumeGroups()).find((g) => g.id === group.id);
    expect([undefined, 'DELETING'], `삭제 응답 ${response.status()} 후 실제 상태`).toContain(actual?.status);
  }
  await waitForGone(api, 'volume-groups', group.id);

  expect((await api.volumes()).filter((v) => v.groupId !== null), '그룹에 묶인 볼륨').toEqual([]);
  await expect(groups.row(group.name)).toHaveCount(0);
});
