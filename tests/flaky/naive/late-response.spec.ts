import { accepted } from '../../../src/api/actions';
import { waitForNextResponse } from '../../../src/flaky/network';
import { expect, test } from '../../../src/fixtures/flaky';

/**
 * [개선 전 테스트] ② API 응답 혼선
 * 실무 원인: 이전 단계에서 늦게 도착한 400을 현재 작업의 결과로 오판했고,
 *           A 리소스 삭제의 늦은 실패를 B 리소스의 실패로 판단했다.
 * 이 파일은 단계 구분 없이 '다음에 오는 DELETE 응답'을 현재 작업의 결과로 본다.
 * FLAKY_LATE_RESPONSE=true에서 간헐적으로 실패한다.
 */
test('FLAKY-RESP-001 보안 그룹 3개를 화면에서 차례로 삭제하면 모두 사라진다', async ({ console, api, page, uniqueName }) => {
  const created = [];
  for (const label of ['sg-a', 'sg-b', 'sg-c']) created.push(accepted(await api.createSecurityGroup({ name: uniqueName(label) })));
  const groups = await console.openSecurityGroups();

  for (const group of created) {
    // 개선 전: 메서드만 보고 다음에 오는 DELETE 응답을 이 단계의 결과로 본다.
    const response = waitForNextResponse(page, 'DELETE');
    await groups.delete(group.name);
    expect((await response).status(), `${group.name} 삭제 응답`).toBe(200);
  }

  // 개선 전: 평소 삭제가 끝나던 시간보다 넉넉하다고 생각한 1초를 기다린 뒤 결과를 본다.
  await page.waitForTimeout(1000);
  const remaining = (await api.securityGroups()).map((g) => g.id);
  expect(created.filter((g) => remaining.includes(g.id)).map((g) => g.name), '남아 있는 보안 그룹').toEqual([]);
});
