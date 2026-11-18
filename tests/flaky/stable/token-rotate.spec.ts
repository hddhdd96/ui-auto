import type { Volume } from '../../../portal/server/types';
import { poll } from '../../../src/api/poll';
import { getWithToken, readCookieToken } from '../../../src/flaky/browserToken';
import { expect, test } from '../../../src/fixtures/flaky';

/**
 * [개선 후 테스트] ④ 환경·네트워크 오류: 토큰 교체
 * 개선 내용:
 *   - 상태를 폴링할 때마다 브라우저 쿠키에서 토큰을 다시 읽는다. 세션 연장으로 쿠키가 바뀌어도 새 토큰을 쓴다.
 *   - 401·403이면 원인을 env로 기록하고 인증 헤더를 다시 받아 온다(쿠키 재조회 → 그래도 안 되면 다시 로그인).
 * FLAKY_TOKEN_ROTATE=true에서도 항상 통과해야 한다.
 */
test('FLAKY-TOKEN-001 화면에서 볼륨을 만들고 세션을 연장해도, 콘솔 세션으로 볼륨이 AVAILABLE이 된 것을 확인할 수 있다', async ({ console, api, page, evidence, uniqueName, baseURL }) => {
  const name = uniqueName('data');
  const volumes = await console.openVolumes();
  await volumes.create(name, 10);
  await expect(console.message).toHaveText(`${name} 생성을 요청했습니다.`);

  await console.extendSession();
  await expect(console.message).toHaveText('세션을 연장했습니다.');

  let lastToken = '';
  await poll({
    what: `볼륨 ${name} → AVAILABLE`,
    evidence,
    read: async () => {
      // 폴링할 때마다 쿠키에서 토큰을 다시 읽는다.
      const token = await readCookieToken(page.context());
      if (lastToken && token !== lastToken) evidence.recordCause('env', '세션 연장으로 쿠키 토큰이 바뀜, 새 토큰 사용', true);
      lastToken = token;
      let response = await getWithToken<Volume[]>(page, '/volumes', token);
      if (response.status === 401 || response.status === 403) {
        // 인증 헤더를 다시 받아 온다: 다시 로그인해서 받은 토큰을 쿠키에도 넣는다.
        evidence.recordCause('env', `상태 조회가 ${response.status}로 거부됨, 다시 로그인해 인증 헤더를 받아 옴`, true);
        await api.login();
        await page.context().addCookies([{ name: 'portal_token', value: api.session.token ?? '', url: baseURL }]);
        response = await getWithToken<Volume[]>(page, '/volumes', api.session.token ?? '');
      }
      expect(response.status, '상태 조회 응답').toBe(200);
      return response.body.find((v) => v.name === name);
    },
    isDone: (volume) => volume?.status === 'AVAILABLE',
    describe: (volume) => volume?.status ?? '목록에 없음',
  });
  await expect(volumes.status(name)).toHaveText('AVAILABLE');
});
