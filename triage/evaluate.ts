import { CATEGORIES, CATEGORY_LABEL, type Category, type TriageItem } from './types';

export type LabOutcome = {
  id: string; set?: string; expected: Exclude<Category, 'unknown'>; description: string; item: TriageItem | null; problem?: string;
  /** 같은 실패를 네트워크 증적 없이 AI로 분류한 결과(증적 보강 효과 비교용). */
  aiWithoutNetwork?: Category | null;
};

type MethodScore = {
  correct: number; total: number; accuracy: number; unknown: number;
  /** 판단 보류가 아닌데 정답과 다른 원인을 고른 수. 실무에서 가장 해로운 경우라 따로 센다. */
  wrong: number;
  byCategory: Record<string, { correct: number; total: number }>;
  confusion: Record<string, Record<Category, number>>;
};

function score(outcomes: LabOutcome[], pick: (outcome: LabOutcome) => Category | null | undefined): MethodScore | null {
  const scored = outcomes.filter(outcome => outcome.item && pick(outcome) != null);
  if (scored.length === 0) return null;
  const result: MethodScore = { correct: 0, total: outcomes.length, accuracy: 0, unknown: 0, wrong: 0, byCategory: {}, confusion: {} };
  for (const outcome of outcomes) {
    const predicted = outcome.item ? pick(outcome) ?? 'unknown' : 'unknown';
    const bucket = result.byCategory[outcome.expected] ??= { correct: 0, total: 0 };
    bucket.total += 1;
    const row = result.confusion[outcome.expected] ??= Object.fromEntries(CATEGORIES.map(c => [c, 0])) as Record<Category, number>;
    row[predicted] += 1;
    if (predicted === 'unknown') result.unknown += 1;
    else if (predicted === outcome.expected) { result.correct += 1; bucket.correct += 1; }
    else result.wrong += 1;
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
    final: score(outcomes, outcome => outcome.item?.final.category),
    aiWithoutNetwork: score(outcomes, outcome => outcome.aiWithoutNetwork),
    aiErrors: outcomes.filter(outcome => outcome.item?.aiError).length,
    evidence: { submitted, dropped },
    tokens: ai.reduce((sum, verdict) => ({
      input: sum.input + (verdict.usage?.inputTokens ?? 0), output: sum.output + (verdict.usage?.outputTokens ?? 0),
    }), { input: 0, output: 0 }),
  };
}

const pct = (value: number) => `${Math.round(value * 100)}%`;

const SET_LABEL: Record<string, string> = { tuning: '기존 15개 (개선 시 결과를 본 세트)', holdout: '검증용 새 실패 (개선 전에 정답 고정)' };

function scoreTable(result: ReturnType<typeof evaluate>): string[] {
  const lines = ['| 분류 방법 | 맞힌 수 | 정확도 | 틀린 답 | 확인 필요 | 제품 결함 | 스크립트 문제 | 환경 문제 |', '|---|---|---|---|---|---|---|---|'];
  for (const [name, method] of [
    ['규칙 분류 (오류 문구 패턴)', result.rule], ['AI 분류', result.ai],
    ['**최종 (AI + 안전장치)**', result.final], ['AI 분류 (네트워크 기록 없이)', result.aiWithoutNetwork],
  ] as const) {
    if (!method) continue;
    const cat = (category: string) => `${method.byCategory[category]?.correct ?? 0}/${method.byCategory[category]?.total ?? 0}`;
    lines.push(`| ${name} | ${method.correct}/${method.total} | ${pct(method.accuracy)} | ${method.wrong} | ${method.unknown} | ${cat('product')} | ${cat('script')} | ${cat('environment')} |`);
  }
  return lines;
}

export function evaluationMarkdown(outcomes: LabOutcome[], model: string | null): string {
  const result = evaluate(outcomes);
  const lines = [
    '## 실패 원인 분류 측정', '',
    `측정 대상: 원인을 알고 일부러 만든 실패 ${result.cases}개 (실제로 재현된 실패 ${result.reproduced}개) · AI 모델: ${model ?? '미사용'}`, '',
    '**읽는 법** · 실제 원인(정답): 실패를 만들 때 정해 둔 원인 · 규칙 분류: 오류 문구 패턴만 보고 고른 원인 · AI 분류: AI가 실패 기록을 읽고 고른 원인 · 최종: AI 답과 반대되는 증거가 기록에 있으면 "확인 필요"로 돌린 결과 · ✓ 맞힘 / ✗ 틀림 · 틀린 답: 확인 필요가 아닌데 원인을 잘못 고른 수(가장 해로운 경우) · 확인 필요: 사람이 봐야 하는 실패', '',
  ];
  const sets = [...new Set(outcomes.map(outcome => outcome.set ?? 'tuning'))];
  for (const set of sets) {
    if (sets.length > 1) lines.push(`### ${SET_LABEL[set] ?? set}`, '');
    lines.push(...scoreTable(sets.length > 1 ? evaluate(outcomes.filter(outcome => (outcome.set ?? 'tuning') === set)) : result), '');
  }
  if (result.ai) {
    lines.push('', `AI 근거 검증: AI가 인용한 근거 ${result.evidence.submitted}개 중 실패 기록에 없어 버린 근거 ${result.evidence.dropped}개 · API 오류 ${result.aiErrors}건 · 사용 토큰 입력 ${result.tokens.input} / 출력 ${result.tokens.output}`);
    const errors = [...new Set(outcomes.flatMap(outcome => (outcome.item?.aiError ? [outcome.item.aiError] : [])))];
    if (errors.length) lines.push('', 'API 오류 내용:', ...errors.slice(0, 5).map(error => `- ${error.replace(/\n/g, ' ').slice(0, 300)}`));
  }
  lines.push('', '| 일부러 만든 실패 | 실제 원인(정답) | 규칙 분류 | AI 분류 | 최종 결과 | 근거 |', '|---|---|---|---|---|---|');
  for (const outcome of outcomes) {
    const item = outcome.item;
    const mark = (category?: Category) => {
      if (!category) return '-';
      if (category === 'unknown') return CATEGORY_LABEL.unknown;
      return `${CATEGORY_LABEL[category]} ${category === outcome.expected ? '✓' : '✗'}`;
    };
    const ai = item?.ai ? mark(item.ai.category) : (item?.aiError ? 'API 오류' : '-');
    const raw = item?.final.conflict ? `반대 증거: ${item.final.conflict}` : item?.ai?.evidence[0] ?? (item?.aiError ? `오류: ${item.aiError}` : outcome.problem ?? '');
    const evidence = raw.replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 160);
    lines.push(`| ${outcome.set === 'holdout' ? '[검증] ' : ''}${outcome.id} ${outcome.description} | ${CATEGORY_LABEL[outcome.expected]} | ${mark(item?.rule.category)} | ${ai} | ${mark(item?.final.category)} | ${evidence} |`);
  }
  return lines.join('\n');
}
