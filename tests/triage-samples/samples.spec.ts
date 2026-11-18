import { accepted } from '../../src/api/actions';
import { expect, test } from '../../src/fixtures/ui';

/**
 * 실패 원인 분류기 검증용 샘플. 일부러 실패하도록 만든 테스트이며, 정답 분류는 tests/triage/labels.json에 있다.
 * TRIAGE_SAMPLES=1일 때만 실행된다(npm run triage:eval). 일반 테스트 실행에는 포함되지 않는다.
 */
test.describe('분류기 검증 샘플', () => {
  test('TRIAGE-SAMPLE-001 [test] 화면에 없는 버튼 이름으로 요소를 찾는다', async ({ console, page }) => {
    await console.openVolumes();
    await page.getByRole('button', { name: '볼륨 만들기' }).click({ timeout: 3000 });
  });

  test('TRIAGE-SAMPLE-002 [test] 여러 요소에 맞는 locator로 선택한다', async ({ console, page }) => {
    await console.openInstances();
    await page.getByRole('combobox').selectOption('small', { timeout: 3000 });
  });

  test('TRIAGE-SAMPLE-003 [test] 같은 이름의 볼륨을 두 번 만든다', async ({ api }) => {
    accepted(await api.createVolume({ name: 'qa-sample-dup', sizeGb: 10 }));
    accepted(await api.createVolume({ name: 'qa-sample-dup', sizeGb: 10 }));
  });

  test('TRIAGE-SAMPLE-004 [test] 없는 볼륨의 속성을 읽는다', async ({ api }) => {
    const missing = (await api.volumes()).find((v) => v.name === 'qa-not-exists');
    expect(missing!.sizeGb).toBe(10);
  });

  test('TRIAGE-SAMPLE-005 [env] 떠 있지 않은 포털 주소로 요청한다', async ({ playwright }) => {
    const context = await playwright.request.newContext();
    await context.get('http://127.0.0.1:9/api/health', { timeout: 3000 });
  });

  test('TRIAGE-SAMPLE-006 [test] API 규칙(202)과 다른 기대값(201)을 적는다', async ({ api }) => {
    const result = await api.createVolume({ name: 'qa-sample-201', sizeGb: 10 });
    expect(result.status, 'POST /volumes 응답 코드').toBe(201);
  });
});
