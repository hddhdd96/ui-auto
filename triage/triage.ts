import { classifyWithAi, type AiConfig } from './ai';
import { classifyByRules } from './rules';
import type { TriageInput, TriageItem, TriageReport } from './types';

export type TriageOptions = { ai?: AiConfig | null; fetchImpl?: typeof fetch };

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** 규칙 분류는 항상, AI 분류는 설정이 있을 때만 수행한다. 어느 쪽도 PASS/FAIL을 바꾸지 않는다. */
export async function triage(inputs: TriageInput[], source: string, options: TriageOptions = {}): Promise<TriageReport> {
  const ai = options.ai ?? null;
  const items: TriageItem[] = [];
  let configError: string | null = null;
  for (const [index, input] of inputs.entries()) {
    const item: TriageItem = {
      tcId: input.tcId, testName: input.testName, result: input.result, rule: classifyByRules(input), ai: null,
    };
    if (ai && configError) {
      // 키·요청 형식 문제는 다음 호출에서도 같으므로 더 호출하지 않는다(재시도도, 낭비도 하지 않음).
      item.aiError = `건너뜀(앞선 설정 오류): ${configError}`;
    } else if (ai) {
      if (index > 0 && ai.minIntervalMs > 0) await sleep(ai.minIntervalMs);
      try {
        item.ai = await classifyWithAi(input, ai, { fetchImpl: options.fetchImpl });
      } catch (error) {
        item.aiError = error instanceof Error ? error.message : String(error);
        if (/ API (400|401|403|404):/.test(item.aiError)) configError = item.aiError;
      }
    }
    items.push(item);
  }
  return {
    generatedAt: new Date().toISOString(),
    source,
    note: '원인 후보는 참고 정보입니다. 판정(PASS/FAIL/BLOCK)과 원본 오류는 source 파일에 그대로 있습니다.',
    model: ai ? `${ai.provider}:${ai.model}` : null,
    items,
  };
}
