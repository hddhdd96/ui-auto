import path from 'node:path';
import { withQuotaRestored } from '../../src/negative/runner';
import { loadUiDataset, resolvePlaceholders } from '../../src/negative/dataset';
import { expect, test } from '../../src/fixtures/ui';

/**
 * 화면 입력 네거티브 dataset 실행기. 케이스는 tests/negative/datasets/ui-volume-form.json에 있다.
 * 화면이 잘못된 입력을 막았는지(오류 메시지)와, 실제로 리소스가 생기지 않았는지(목록 API)를 함께 확인한다.
 */
const dataset = loadUiDataset(path.join(import.meta.dirname, 'datasets', 'ui-volume-form.json'));

test.describe(`네거티브 dataset: ${dataset.area}`, () => {
  for (const c of dataset.cases) {
    test(`${c.id} ${c.title}`, { tag: ['@negative', `@risk-${c.risk}`, `@${c.category}`] },
      async ({ console, api, uniqueName }) => {
        const run = async () => {
          if (c.quota) await api.expectOk('PUT', '/quota', c.quota);
          const input = resolvePlaceholders(c.input, { unique: uniqueName('neg') });
          const before = await api.volumes();
          const volumes = await console.openVolumes();

          await volumes.create(input.name ?? '', input.sizeGb ?? '');

          await expect(console.error).toHaveText(c.expectMessage);
          await expect(volumes.row(input.name ?? '')).toHaveCount(0);
          expect(await api.volumes(), '화면에서 막은 뒤 목록 API의 볼륨').toEqual(before);
        };
        if (c.quota) await withQuotaRestored(api, run);
        else await run();
      });
  }
});
