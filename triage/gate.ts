import { inputText } from './input';
import type { Category, FinalVerdict, TriageInput, Verdict } from './types';

/**
 * 안전장치: AI(또는 규칙) 답과 반대 방향을 가리키는 증거가 실패 기록에 있으면 최종 결과를 '확인 필요'로 돌린다.
 * 목표는 많이 맞히는 것이 아니라, 틀린 원인을 자신 있게 내놓지 않는 것이다.
 */
type Signal = { category: Exclude<Category, 'unknown'> | 'ambiguous'; pattern: RegExp; label: string };

const SIGNALS: Signal[] = [
  { category: 'environment', label: '연결·실행 환경 오류', pattern: /net::ERR_CONNECTION_\w+|ERR_NAME_NOT_RESOLVED|ERR_EMPTY_RESPONSE|ECONNREFUSED|ECONNRESET|socket hang up|Executable doesn't exist|Error reading storage state/ },
  { category: 'environment', label: '느리거나 끝나지 않은 요청', pattern: /-> completed after \d{4,}ms|still pending after \d+ms/ },
  { category: 'environment', label: '테스트 중 로그인 화면으로 돌아감', pattern: /heading "Log in"/ },
  { category: 'script', label: 'Locator가 여러 요소와 일치', pattern: /strict mode violation/ },
  { category: 'script', label: '테스트가 보낸 요청이 거절됨(400/404/409)', pattern: /-> (400|404|409)\b|Received: (400|404|409)\b/ },
  { category: 'product', label: '서버 오류(5xx)', pattern: /-> 5\d\d\b|Received: 5\d\d\b/ },
];

const LABEL: Record<Exclude<Category, 'unknown'>, string> = { product: '제품 결함', script: '스크립트 문제', environment: '환경 문제' };

/** 기대값과 실제값이 대소문자·공백만 다르면, 제품 변경인지 테스트 오타인지 기록만으로 가를 수 없다. */
function caseOnlyDifference(text: string): string | null {
  const expected = /Expected:\s*"([^"]*)"/.exec(text)?.[1];
  const received = /Received:\s*"([^"]*)"/.exec(text)?.[1];
  if (expected === undefined || received === undefined || expected === received) return null;
  const normalize = (value: string) => value.replace(/\s+/g, '').toLowerCase();
  return normalize(expected) === normalize(received) ? `Expected: "${expected}" / Received: "${received}"` : null;
}

export function applyGate(input: TriageInput, rule: Verdict, ai: Verdict | null): FinalVerdict {
  const base = ai?.category ?? rule.category;
  const source = ai ? 'AI' : '규칙';
  if (base === 'unknown') return { category: 'unknown', reason: `${source === 'AI' ? 'AI가' : '규칙이'} 원인을 고르지 않음` };

  const text = inputText(input);
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const ambiguous = caseOnlyDifference(text);
  if (ambiguous) {
    return { category: 'unknown', reason: `${source} 판단은 ${LABEL[base]}이지만 기대값과 실제값이 대소문자·공백만 다름`, conflict: ambiguous };
  }
  for (const signal of SIGNALS) {
    if (signal.category === base || signal.category === 'ambiguous') continue;
    const line = lines.find(candidate => signal.pattern.test(candidate));
    if (line) {
      return {
        category: 'unknown',
        reason: `${source} 판단은 ${LABEL[base]}이지만 ${LABEL[signal.category]} 쪽 증거가 있음(${signal.label})`,
        conflict: line.slice(0, 200),
      };
    }
  }
  return { category: base, reason: `${source} 판단과 반대되는 증거 없음` };
}
