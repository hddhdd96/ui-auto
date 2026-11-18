import type { DiffLine, FileDiff } from './diff';

/**
 * 판정 완화 탐지 규칙 목록.
 * 테스트가 실패했을 때 원인을 고치지 않고 판정 기준을 바꿔 통과시키는 변경을 찾는다.
 */
export interface Violation {
  ruleId: string;
  file: string;
  line: number;
  detail: string;
}

export interface GuardrailRule {
  id: string;
  title: string;
  /** 왜 막는지 */
  why: string;
  check: (file: FileDiff) => Violation[];
}

const EXPECT_CALL = /\bexpect(?:\.soft)?\s*\(/g;
const TEST_DECL = /\btest(?:\.(?:only|skip|fixme|fail))?\s*\(\s*['"`]/g;
const count = (lines: DiffLine[], pattern: RegExp) => lines.reduce((sum, l) => sum + (l.text.match(pattern)?.length ?? 0), 0);
const isComment = (text: string) => /^\s*(\/\/|\*|\/\*)/.test(text);
const code = (lines: DiffLine[]) => lines.filter((l) => !isComment(l.text));
const num = (text: string) => Number(text.replace(/_/g, ''));

/** expect(대상).matcher(값) 한 줄을 대상·matcher·값으로 나눈다. 여러 줄에 걸친 assertion은 다루지 않는다. */
const ASSERTION = /expect(?:\.soft)?\((.+?)\)((?:\.not)?)\.(\w+)\((.*)\)\s*;?\s*$/;
function parseAssertion(text: string) {
  const match = ASSERTION.exec(text.trim());
  if (!match) return null;
  // 기대값만 비교하기 위해 끝에 붙은 옵션 객체(예: , { timeout: 5000 })는 뗀다. 옵션 변경은 GR-05가 따로 본다.
  const value = match[4]!.trim().replace(/,\s*\{[^{}]*\}\s*$/, '');
  return { subject: match[1]!.trim(), not: match[2] === '.not', matcher: match[3]!, value };
}

/** matcher의 엄격도. 값이 작을수록 느슨하다. */
const STRENGTH: Record<string, number> = {
  toStrictEqual: 3, toEqual: 3, toBe: 3, toHaveText: 3, toHaveCount: 3, toHaveLength: 3, toHaveValue: 3,
  toMatchObject: 2, toContain: 2, toContainText: 2, toMatch: 2, toHaveProperty: 2,
  toBeGreaterThan: 1, toBeGreaterThanOrEqual: 1, toBeLessThan: 1, toBeLessThanOrEqual: 1,
  toBeTruthy: 0, toBeDefined: 0, toBeVisible: 0, toBeFalsy: 0,
};

/** 같은 키에 대해 숫자가 커졌는지 찾는다(retry·timeout 증가). */
function numericIncrease(file: FileDiff, ruleId: string, keys: RegExp, label: string): Violation[] {
  const pattern = new RegExp(`\\b(${keys.source})\\s*[:=]\\s*([\\d_]+)`, 'g');
  const collect = (lines: DiffLine[]) => {
    const found = new Map<string, number>();
    for (const l of code(lines)) for (const m of l.text.matchAll(pattern)) found.set(m[1]!, num(m[2]!));
    return found;
  };
  const before = collect(file.removed);
  const violations: Violation[] = [];
  for (const l of code(file.added)) {
    for (const m of l.text.matchAll(pattern)) {
      const key = m[1]!;
      const after = num(m[2]!);
      const old = before.get(key);
      if (old !== undefined && after > old) {
        violations.push({ ruleId, file: file.path, line: l.line, detail: `${label} ${key}: ${old} → ${after}` });
      }
    }
  }
  return violations;
}

const addedMatching = (file: FileDiff, ruleId: string, pattern: RegExp, detail: string): Violation[] =>
  code(file.added).filter((l) => pattern.test(l.text)).map((l) => ({ ruleId, file: file.path, line: l.line, detail: `${detail}: ${l.text.trim()}` }));

export const RULES: GuardrailRule[] = [
  {
    id: 'GR-01-ASSERT-REMOVED',
    title: 'assertion 삭제',
    why: '확인하던 조건을 지우면 결함이 있어도 테스트가 통과한다.',
    check: (file) => {
      if (!file.path.endsWith('.ts')) return [];
      const removed = count(code(file.removed), EXPECT_CALL);
      const added = count(code(file.added), EXPECT_CALL);
      if (removed <= added) return [];
      const first = code(file.removed).find((l) => /\bexpect(?:\.soft)?\s*\(/.test(l.text));
      return [{ ruleId: 'GR-01-ASSERT-REMOVED', file: file.path, line: first?.line ?? 0, detail: `expect가 ${removed}개 삭제되고 ${added}개 추가됨(순감소 ${removed - added}개)` }];
    },
  },
  {
    id: 'GR-02-ASSERT-WEAKENED',
    title: 'assertion 완화',
    why: '같은 대상을 더 느슨한 matcher로 확인하거나 expect.soft로 바꾸면, 틀린 값도 통과하거나 실패가 테스트를 멈추지 않는다.',
    check: (file) => {
      const violations = addedMatching(file, 'GR-02-ASSERT-WEAKENED', /\bexpect\.soft\s*\(/, 'expect.soft 추가');
      const before = new Map<string, string>();
      for (const l of code(file.removed)) {
        const a = parseAssertion(l.text);
        if (a) before.set(`${a.subject}${a.not ? '.not' : ''}`, a.matcher);
      }
      for (const l of code(file.added)) {
        const a = parseAssertion(l.text);
        if (!a) continue;
        const oldMatcher = before.get(`${a.subject}${a.not ? '.not' : ''}`);
        if (oldMatcher && (STRENGTH[a.matcher] ?? 3) < (STRENGTH[oldMatcher] ?? 3)) {
          violations.push({ ruleId: 'GR-02-ASSERT-WEAKENED', file: file.path, line: l.line, detail: `expect(${a.subject}): ${oldMatcher} → ${a.matcher}` });
        }
      }
      return violations;
    },
  },
  {
    id: 'GR-03-EXPECTED-CHANGED',
    title: '기대값 변경',
    why: '실패한 값에 맞춰 기대값을 고치면, 제품이 틀리게 바뀌어도 테스트가 그 동작을 정답으로 받아들인다.',
    check: (file) => {
      const violations: Violation[] = [];
      if (file.path.endsWith('.ts')) {
        const before = new Map<string, string>();
        for (const l of code(file.removed)) {
          const a = parseAssertion(l.text);
          if (a) before.set(`${a.subject}|${a.not}|${a.matcher}`, a.value);
        }
        for (const l of code(file.added)) {
          const a = parseAssertion(l.text);
          if (!a) continue;
          const old = before.get(`${a.subject}|${a.not}|${a.matcher}`);
          if (old !== undefined && old !== a.value) {
            violations.push({ ruleId: 'GR-03-EXPECTED-CHANGED', file: file.path, line: l.line, detail: `expect(${a.subject}).${a.matcher}: ${old} → ${a.value}` });
          }
        }
      }
      // dataset과 검출 기대 목록의 기대값(status, code, field, category, mustFail)
      if (file.path.endsWith('.json')) {
        const key = /"(status|code|field|category|count|mustFail)"\s*:\s*(.+?),?\s*$/;
        const before = new Map<string, string>();
        for (const l of file.removed) {
          const m = key.exec(l.text);
          if (m) before.set(m[1]!, m[2]!);
        }
        for (const l of file.added) {
          const m = key.exec(l.text);
          if (m && before.has(m[1]!) && before.get(m[1]!) !== m[2]) {
            violations.push({ ruleId: 'GR-03-EXPECTED-CHANGED', file: file.path, line: l.line, detail: `"${m[1]}": ${before.get(m[1]!)} → ${m[2]}` });
          }
        }
      }
      return violations;
    },
  },
  {
    id: 'GR-04-RETRY-INCREASED',
    title: 'retry 증가',
    why: '재시도를 늘리면 간헐적 실패(Flaky)의 원인이 그대로 남은 채 결과만 초록색이 된다.',
    check: (file) => [
      ...numericIncrease(file, 'GR-04-RETRY-INCREASED', /retries|networkRetries|maxRetries/, '재시도 횟수'),
      ...addedMatching(file, 'GR-04-RETRY-INCREASED', /--retries[= ]\d+|describe\.configure\(\s*\{[^}]*retries/, '재시도 설정 추가'),
    ],
  },
  {
    id: 'GR-05-TIMEOUT-INCREASED',
    title: 'timeout 증가',
    why: '기다리는 시간을 늘리면 느려진 원인(지연, 상태 불일치)을 숨기고, 언젠가 다시 실패한다.',
    check: (file) => [
      ...numericIncrease(file, 'GR-05-TIMEOUT-INCREASED', /timeout|timeoutMs|pollTimeoutMs|actionTimeout|navigationTimeout/, '대기 시간'),
      ...addedMatching(file, 'GR-05-TIMEOUT-INCREASED', /\btest\.setTimeout\s*\(|\btest\.slow\s*\(/, '테스트 시간 늘림'),
      ...addedMatching(file, 'GR-05-TIMEOUT-INCREASED', /\bexpect(?:\.soft)?\(.+\)\.\w+\(.*\{\s*timeout\s*:/, 'assertion에 대기 시간 지정'),
    ],
  },
  {
    id: 'GR-06-TEST-SKIPPED',
    title: 'skip·only·fixme 추가',
    why: '실패하는 테스트를 건너뛰거나(skip, fixme, fail) 특정 테스트만 돌리면(only) 나머지 판정이 사라진다.',
    check: (file) => addedMatching(file, 'GR-06-TEST-SKIPPED', /\b(test|describe|it)(\.describe)?\.(skip|only|fixme|fail)\s*\(/, '테스트 실행 범위 변경'),
  },
  {
    id: 'GR-07-FIXED-WAIT',
    title: '고정 대기 추가',
    why: 'waitForTimeout으로 시간을 벌면 실제 작업 완료를 확인하지 않고 판정하게 된다. 상태 폴링이나 조건부 대기로 바꿔야 한다.',
    check: (file) => addedMatching(file, 'GR-07-FIXED-WAIT', /\bwaitForTimeout\s*\(/, '고정 대기'),
  },
  {
    id: 'GR-08-TEST-REMOVED',
    title: '테스트·dataset 케이스 삭제',
    why: '실패하는 테스트나 dataset 케이스를 지우면 그 조건을 더 이상 확인하지 않는다.',
    check: (file) => {
      const violations: Violation[] = [];
      const removedTests = count(code(file.removed), TEST_DECL);
      const addedTests = count(code(file.added), TEST_DECL);
      if (file.path.endsWith('.ts') && removedTests > addedTests) {
        violations.push({ ruleId: 'GR-08-TEST-REMOVED', file: file.path, line: file.removed[0]?.line ?? 0, detail: `테스트 ${removedTests - addedTests}개 순감소` });
      }
      const caseId = /"id"\s*:\s*"(NEG-[A-Z-]+\d{3})"/;
      if (file.path.endsWith('.json')) {
        const added = new Set(file.added.map((l) => caseId.exec(l.text)?.[1]).filter(Boolean));
        for (const l of file.removed) {
          const id = caseId.exec(l.text)?.[1];
          if (id && !added.has(id)) violations.push({ ruleId: 'GR-08-TEST-REMOVED', file: file.path, line: l.line, detail: `dataset 케이스 ${id} 삭제` });
        }
      }
      return violations;
    },
  },
];

/** 가드레일 자체(규칙, 범위, AI 작업 지침, 워크플로)를 바꾸는 변경. 규칙을 고쳐 검사를 피하지 못하게 승인을 요구한다. */
export const PROTECTED_RULE = {
  id: 'GR-09-GUARDRAIL-CHANGED',
  title: '가드레일 변경',
  why: '규칙이나 검사 범위, 워크플로를 바꾸면 위 검사를 피할 수 있으므로 사람의 승인이 필요하다.',
};
