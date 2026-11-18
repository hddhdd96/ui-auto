import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { checkDiff } from '../check';
import { RULES } from '../rules';

/**
 * 가드레일 자기검증. 예시 diff마다 기대한 규칙만 정확히 걸리는지 확인한다.
 * 위반 예시가 통과하면 탐지 누락, 통과 예시가 걸리면 잘못된 차단이다.
 */
const dir = path.join(import.meta.dirname, '..', 'examples');
const { cases } = JSON.parse(readFileSync(path.join(dir, 'expected.json'), 'utf8')) as { cases: Record<string, string[]> };

test.describe('가드레일 자기검증', () => {
  for (const [file, expected] of Object.entries(cases)) {
    test(`GUARD-${file} ${expected.length === 0 ? '통과해야 함' : `${expected.join(', ')} 탐지`}`, () => {
      const found = [...new Set(checkDiff(readFileSync(path.join(dir, file), 'utf8')).map((v) => v.ruleId))].sort();
      expect(found).toEqual([...expected].sort());
    });
  }

  test('GUARD-COVERAGE 모든 규칙에 위반 예시가 하나 이상 있다', () => {
    const covered = new Set(Object.values(cases).flat());
    const missing = [...RULES.map((r) => r.id), 'GR-09-GUARDRAIL-CHANGED'].filter((id) => !covered.has(id));
    expect(missing).toEqual([]);
  });
});
