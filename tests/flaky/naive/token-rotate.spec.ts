import type { Volume } from '../../../portal/server/types';
import { poll } from '../../../src/api/poll';
import { getWithToken, readCookieToken } from '../../../src/flaky/browserToken';
import { expect, test } from '../../../src/fixtures/flaky';

/**
 * [개선 전 테스트] ④ 환경·네트워크 오류: 토큰 교체
 * 실무 원인: UI 세션 연장 시 쿠키만 바뀌고, API 요청 헤더는 예전 토큰을 써서 401이 발생했다.
 * 이 파일은 처음 받은 토큰을 테스트 끝까지 쓴다. FLAKY_TOKEN_ROTATE=true에서 간헐적으로 실패한다.
 */
test('FLAKY-TOKEN-001 화면에서 볼륨을 만들고 세션을 연장해도, 콘솔 세션으로 볼륨이 AVAILABLE이 된 것을 확인할 수 있다', async ({ console, page, evidence, uniqueName }) => {
  // 개선 전: 처음 받은 토큰을 저장해 두고 계속 쓴다.
  const token = await readCookieToken(page.context());
  const name = uniqueName('data');
  const volumes = await console.openVolumes();
  await volumes.create(name, 10);
  await expect(console.message).toHaveText(`${name} 생성을 요청했습니다.`);

  await console.extendSession();
  await expect(console.message).toHaveText('세션을 연장했습니다.');

  await poll({
    what: `볼륨 ${name} → AVAILABLE`,
    evidence,
    read: async () => {
      const response = await getWithToken<Volume[]>(page, '/volumes', token);
      expect(response.status, '상태 조회 응답').toBe(200);
      return response.body.find((v) => v.name === name);
    },
    isDone: (volume) => volume?.status === 'AVAILABLE',
    describe: (volume) => volume?.status ?? '목록에 없음',
  });
  await expect(volumes.status(name)).toHaveText('AVAILABLE');
});
