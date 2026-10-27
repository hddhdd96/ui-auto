import { CATEGORIES, CATEGORY_LABEL, type Category, type TriageItem } from './types';

export type LabOutcome = {
  id: string; expected: Exclude<Category, 'unknown'>; description: string; item: TriageItem | null; problem?: string;
  /** 같은 실패를 네트워크 증적 없이 AI로 분류한 결과(증적 보강 효과 비교용). */
  aiWithoutNetwork?: Category | null;
};

type MethodScore = {
  correct: number; total: number; accuracy: number; unknown: number;
  byCategory: Record<string, { correct: number; total: number }>;
  confusion: Record<string, Record<Category, number>>;
};

function score(outcomes: LabOutcome[], pick: (outcome: LabOutcome) => Category | null | undefined): MethodScore | null {
  const scored = outcomes.filter(outcome => outcome.item && pick(outcome) != null);
  if (scored.length === 0) return null;
  const result: MethodScore = { correct: 0, total: outcomes.length, accuracy: 0, unknown: 0, byCategory: {}, confusion: {} };
  for (const outcome of outcomes) {
    const predicted = outcome.item ? pick(outcome) ?? 'unknown' : 'unknown';
    const bucket = result.byCategory[outcome.expected] ??= { correct: 0, total: 0 };
    bucket.total += 1;
    const row = result.confusion[outcome.expected] ??= Object.fromEntries(CATEGORIES.map(c => [c, 0])) as Record<Category, number>;
    row[predicted] += 1;
    if (predicted === 'unknown') result.unknown += 1;
    if (predicted === outcome.expected) { result.correct += 1; bucket.correct += 1; }
  }
  result.accuracy = result.correct / result.total;
  return result;
}

export function evaluate(outcomes: LabOutcome[]) {
  const ai = outcomes.flatMap(outcome => (outcome.item?.ai ? [outcome.item.ai] : []));
  const submitted = ai.reduce((sum, verdict) => sum + verdict.evidence.length + verdict.droppedEvidence, 0);
  const dropped = ai.reduce((sum, verdict) => sum + verdict.droppedEvidence, 0);
  return {
    cases: outcomes.length,
    reproduced: outcomes.filter(outcome => outcome.item).length,
    rule: score(outcomes, outcome => outcome.item?.rule.category),
    ai: score(outcomes, outcome => outcome.item?.ai?.category ?? (outcome.item?.aiError ? 'unknown' : null)),
    aiWithoutNetwork: score(outcomes, outcome => outcome.aiWithoutNetwork),
    aiErrors: outcomes.filter(outcome => outcome.item?.aiError).length,
    evidence: { submitted, dropped },
    tokens: ai.reduce((sum, verdict) => ({
      input: sum.input + (verdict.usage?.inputTokens ?? 0), output: sum.output + (verdict.usage?.outputTokens ?? 0),
    }), { input: 0, output: 0 }),
  };
}

const pct = (value: number) => `${Math.round(value * 100)}%`;

export function evaluationMarkdown(outcomes: LabOutcome[], model: string | null): string {
  const result = evaluate(outcomes);
  const lines = [
    '## 실패 원인 분류 측정', '',
    `케이스 ${result.cases}개 (재현 ${result.reproduced}개) · AI 모델: ${model ?? '미사용'}`, '',
    '| 방식 | 일치 | 일치율 | 판단 보류 | 제품 | 스크립트 | 환경 |', '|---|---|---|---|---|---|---|',
  ];
  for (const [name, method] of [['규칙 기반', result.rule], ['AI', result.ai], ['AI (네트워크 증적 제외)', result.aiWithoutNetwork]] as const) {
    if (!method) continue;
    const cat = (category: string) => `${method.byCategory[category]?.correct ?? 0}/${method.byCategory[category]?.total ?? 0}`;
    lines.push(`| ${name} | ${method.correct}/${method.total} | ${pct(method.accuracy)} | ${method.unknown} | ${cat('product')} | ${cat('script')} | ${cat('environment')} |`);
  }
  if (result.ai) {
    lines.push('', `AI 근거 검증: 제시 ${result.evidence.submitted}개 중 원문 불일치로 버림 ${result.evidence.dropped}개 · API 오류 ${result.aiErrors}건 · 토큰 입력 ${result.tokens.input} / 출력 ${result.tokens.output}`);
  }
  lines.push('', '| 케이스 | 정답 | 규칙 기반 | AI | AI 근거(첫 번째) |', '|---|---|---|---|---|');
  for (const outcome of outcomes) {
    const item = outcome.item;
    const mark = (category?: Category) => (category ? `${CATEGORY_LABEL[category]}${category === outcome.expected ? ' ✓' : ''}` : '-');
    const ai = item?.ai ? mark(item.ai.category) : (item?.aiError ? '오류' : '-');
    const evidence = (item?.ai?.evidence[0] ?? outcome.problem ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 100);
    lines.push(`| ${outcome.id} ${outcome.description} | ${CATEGORY_LABEL[outcome.expected]} | ${mark(item?.rule.category)} | ${ai} | ${evidence} |`);
  }
  return lines.join('\n');
}
