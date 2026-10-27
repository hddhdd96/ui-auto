import { inputText } from './input';
import type { TriageInput, Verdict } from './types';

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * 근거 검증: 모델이 낸 근거 중 입력 원문에 실제로 있는 문장만 남긴다.
 * 남는 근거가 없으면 분류를 'unknown'으로 내린다. 근거 없는 원인 단정은 남기지 않는다.
 */
export function groundVerdict(verdict: Verdict, input: TriageInput): Verdict & { droppedEvidence: number } {
  const haystack = normalize(inputText(input));
  const kept = verdict.evidence.filter(quote => normalize(quote).length >= 4 && haystack.includes(normalize(quote)));
  const droppedEvidence = verdict.evidence.length - kept.length;
  if (verdict.category !== 'unknown' && kept.length === 0) {
    return {
      ...verdict, category: 'unknown', confidence: 'low', evidence: [],
      reason: `원문에서 확인되는 근거가 없어 판단을 보류했습니다. (모델 제시: ${verdict.category})`, droppedEvidence,
    };
  }
  return { ...verdict, evidence: kept, droppedEvidence };
}
