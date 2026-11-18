import { expect, test } from '../../../src/fixtures/flaky';

/**
 * [개선 전 테스트] ③ UI 반영 지연
 * 실무 원인: API로는 이미 AVAILABLE인데 화면은 새로고침 전 행을 계속 CREATING으로 보여줬다.
 * 이 파일은 고정 시간을 기다린 뒤 기존 행을 다시 확인한다. FLAKY_UI_STALE=true에서 간헐적으로 실패한다.
 */
test('FLAKY-UI-001 화면에서 볼륨을 만들면 목록에 AVAILABLE로 표시된다', async ({ console, page, uniqueName }) => {
  const name = uniqueName('data');
  const volumes = await console.openVolumes();

  await volumes.create(name, 10);
  await expect(console.message).toHaveText(`${name} 생성을 요청했습니다.`);

  // 개선 전: 평소 생성이 끝나던 시간보다 넉넉하다고 생각한 2초를 기다린 뒤, 화면에 있던 행을 그대로 다시 읽는다.
  await page.waitForTimeout(2000);
  expect(await volumes.status(name).textContent(), '화면의 볼륨 상태').toBe('AVAILABLE');
});
