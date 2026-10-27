import { inputText } from './input';
import type { Category, TriageInput, Verdict } from './types';

/**
 * 비교 기준선(baseline): QA가 흔히 쓰는 오류 문자열 규칙.
 * 실험 케이스를 보고 맞추지 않도록 일반적인 패턴만 두었다. 위에서부터 먼저 맞는 규칙을 쓴다.
 */
const RULES: { category: Category; confidence: Verdict['confidence']; pattern: RegExp; reason: string }[] = [
  {
    category: 'environment', confidence: 'high',
    pattern: /ECONNREFUSED|ECONNRESET|ERR_CONNECTION_\w+|ERR_NAME_NOT_RESOLVED|ERR_EMPTY_RESPONSE|net::ERR_\w+|socket hang up|Failed to fetch|Executable doesn't exist|browserType\.launch|Authentication required|\b401\b/,
    reason: '연결·인증·실행 환경 오류 문자열',
  },
  {
    category: 'script', confidence: 'medium',
    pattern: /strict mode violation|TypeError|ReferenceError|is not a function|Cannot read propert|\b404\b/,
    reason: 'Locator 중복·코드 오류·잘못된 경로 문자열',
  },
  {
    category: 'product', confidence: 'low',
    pattern: /\b5\d\d\b|Expected|Received|toMatchObject|toHaveText|toHaveCount/,
    reason: '기대값과 실제값 불일치 또는 서버 오류',
  },
];

export function classifyByRules(input: TriageInput): Verdict {
  const lines = inputText(input).split('\n').map(line => line.trim()).filter(Boolean);
  for (const rule of RULES) {
    const line = lines.find(candidate => rule.pattern.test(candidate));
    if (line) {
      return { category: rule.category, confidence: rule.confidence, evidence: [line.slice(0, 200)], reason: rule.reason };
    }
  }
  return { category: 'unknown', confidence: 'low', evidence: [], reason: '일치하는 규칙 없음' };
}
