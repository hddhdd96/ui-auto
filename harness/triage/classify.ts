import type { FailedTest } from './report';
import { RULES } from './rules';
import type { Category } from './rules';

export interface Classification {
  tcId: string;
  title: string;
  project: string;
  /** 판정. 맞는 규칙이 없으면 unknown */
  category: Category | 'unknown';
  ruleId: string | null;
  reason: string;
  evidence: string[];
  /** high: 근거가 한 방향, low: 다른 분류의 근거도 있음(반대 증거) 또는 넓은 규칙으로만 판정 */
  confidence: 'high' | 'low';
  /** 판정과 다른 분류를 가리킨 규칙 */
  counterEvidence: { ruleId: string; category: Category; evidence: string[] }[];
}

/** 규칙을 위에서부터 적용해 처음 맞은 규칙으로 판정하고, 다른 분류를 가리키는 규칙은 반대 증거로 남긴다. */
export function classify(test: FailedTest): Classification {
  const matched = RULES.map((rule) => ({ rule, evidence: rule.match(test) })).filter((m) => m.evidence !== null);
  const base = { tcId: test.tcId, title: test.title, project: test.project };
  const winner = matched[0];
  if (!winner) {
    return { ...base, category: 'unknown', ruleId: null, reason: '맞는 규칙이 없어 분류하지 못했습니다.', evidence: [test.message.split('\n')[0] ?? ''], confidence: 'low', counterEvidence: [] };
  }
  const counter = matched
    .filter((m) => m.rule.category !== winner.rule.category && !m.rule.broad)
    .map((m) => ({ ruleId: m.rule.id, category: m.rule.category, evidence: m.evidence! }));
  return {
    ...base,
    category: winner.rule.category,
    ruleId: winner.rule.id,
    reason: winner.rule.description,
    evidence: winner.evidence!,
    confidence: counter.length > 0 || winner.rule.broad ? 'low' : 'high',
    counterEvidence: counter,
  };
}
