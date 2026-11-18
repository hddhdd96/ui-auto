import { accepted, waitForGone } from '../../../src/api/actions';
import { waitForOwnResponse } from '../../../src/flaky/network';
import { expect, test } from '../../../src/fixtures/flaky';

/**
 * [개선 후 테스트] ② API 응답 혼선
 * 개선 내용:
 *   - 단계마다 그 단계에서 보낸 DELETE 요청(메서드·URL·리소스 ID)의 응답만 수집해 요청과 응답을 짝짓는다.
 *     앞 단계의 늦은 응답은 URL이 달라 이 단계의 결과로 섞이지 않는다.
 *   - 응답이 400이면 목록 API로 리소스가 실제로 남아 있는지 다시 확인한 뒤 판정한다.
 *   - 단계가 끝났는지는 목록 API에서 대상이 사라질 때까지 폴링해서 판정한다.
 * FLAKY_LATE_RESPONSE=true에서도 항상 통과해야 한다.
 */
test('FLAKY-RESP-001 보안 그룹 3개를 화면에서 차례로 삭제하면 모두 사라진다', async ({ console, api, page, uniqueName }) => {
  const created = [];
  for (const label of ['sg-a', 'sg-b', 'sg-c']) created.push(accepted(await api.createSecurityGroup({ name: uniqueName(label) })));
  const groups = await console.openSecurityGroups();

  for (const group of created) {
    const ownResponse = waitForOwnResponse(page, 'DELETE', `/security-groups/${group.id}`);
    await groups.delete(group.name);
    const response = await ownResponse;

    if (!response.ok()) {
      const actual = (await api.securityGroups()).find((g) => g.id === group.id);
      expect([undefined, 'DELETING'], `${group.name} 삭제 응답 ${response.status()} 후 실제 상태`).toContain(actual?.status);
    }
    await waitForGone(api, 'security-groups', group.id);
  }

  for (const group of created) await expect(groups.row(group.name)).toHaveCount(0);
});
