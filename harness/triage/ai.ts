import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { Classification } from './classify';
import type { FailedTest } from './report';

/**
 * [선택 기능] AI 실패 원인 추천.
 * 규칙 기반 판정을 대신하지 않는다. 규칙 판정 옆에 참고 의견으로만 붙인다.
 * TRIAGE_AI=1일 때만 동작하고, 인증 정보가 없거나 호출이 실패하면 추천 없이 넘어간다.
 */
export const aiEnabled = () => process.env.TRIAGE_AI === '1';

const RecommendationSchema = z.object({
  category: z.enum(['product', 'test', 'env']).describe('product: 제품 결함, test: 테스트 코드 문제, env: 환경 요인'),
  reason: z.string().describe('판단 근거. 증적의 어느 부분을 근거로 했는지 한국어 2~3문장'),
  nextAction: z.string().describe('다음에 확인하거나 고칠 것 한 가지. 한국어 한 문장'),
});

export type AiRecommendation = z.infer<typeof RecommendationSchema> & { model: string };

const SYSTEM = `당신은 웹 콘솔과 REST API 테스트 자동화의 실패 원인을 분류하는 QA 엔지니어다.
실패 한 건의 증적을 보고 원인을 다음 셋 중 하나로 고른다.
- product: 제품(포털)의 동작이 요구사항과 다르다. 응답 코드, 리소스 상태, 화면 표시가 규칙과 다르다.
- test: 테스트 코드나 테스트 데이터의 문제다. 잘못된 locator, 고정 시간 대기 후 판정, 다른 요청의 응답을 현재 단계 결과로 해석, 잘못된 기대값, 데이터 충돌 등.
- env: 제품 결함이 아닌 실행 환경 요인이다. 네트워크 끊김, 인증 토큰 교체·만료, 포털 미기동, 실행 모드 설정 오류 등.
판정 기준을 느슨하게 바꿔 통과시키는 조치(assert 삭제, retry·timeout 증가, skip)는 다음 조치로 제안하지 않는다.
증적에 없는 사실을 지어내지 말고, 근거가 부족하면 그렇다고 reason에 적는다.`;

function evidenceText(test: FailedTest, rule: Classification): string {
  const line = Number(test.location?.split(':').at(-1) ?? 0);
  const sourceLines = test.source.split('\n');
  const excerpt = sourceLines.slice(Math.max(0, line - 15), line + 5).join('\n');
  return [
    `# 테스트\n${test.title} (프로젝트: ${test.project}, 파일: ${test.file}, 위치: ${test.location ?? '알 수 없음'})`,
    `# 오류 메시지\n${test.message.split('\n').slice(0, 30).join('\n')}`,
    `# 오류 위치 주변 테스트 코드\n${excerpt}`,
    `# HTTP 응답 이력(최근 20건, source=browser는 화면이 보낸 요청, retry=true는 화면에 보이지 않는 재전송)\n${JSON.stringify(test.http.slice(-20))}`,
    `# 상태 폴링 이력(최근 10건)\n${JSON.stringify(test.polls.slice(-10))}`,
    `# 원인별 로그\n${JSON.stringify(test.causes)}`,
    `# 포털이 주입한 Flaky 이력\n${JSON.stringify(test.flakyEvents)}`,
    `# 참고: 규칙 기반 판정\n${rule.category} (${rule.ruleId ?? '규칙 없음'}): ${rule.reason}`,
  ].join('\n\n');
}

export async function recommend(test: FailedTest, rule: Classification): Promise<AiRecommendation | { error: string }> {
  const model = process.env.TRIAGE_AI_MODEL ?? 'claude-opus-5-5';
  try {
    const client = new Anthropic();
    const response = await client.beta.messages.parse({
      model,
      max_tokens: 4000,
      // 거절되면 서버가 다른 모델로 다시 실행한다(거절 분류별 기본 경로).
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // 분류 작업이라 낮은 effort로 충분하다.
      output_config: { effort: 'low', format: betaZodOutputFormat(RecommendationSchema) },
      system: SYSTEM,
      messages: [{ role: 'user', content: evidenceText(test, rule) }],
    });
    if (response.stop_reason === 'refusal') return { error: 'AI가 응답을 거절했습니다.' };
    if (!response.parsed_output) return { error: `AI 응답을 해석하지 못했습니다(stop_reason: ${response.stop_reason}).` };
    return { ...response.parsed_output, model: response.model };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return { error: 'Anthropic API 인증 정보가 없거나 올바르지 않습니다.' };
    if (error instanceof Anthropic.RateLimitError) return { error: 'Anthropic API 요청 한도를 넘었습니다.' };
    if (error instanceof Anthropic.APIError) return { error: `Anthropic API 오류(HTTP ${error.status}): ${error.message}` };
    const message = error instanceof Error ? error.message : String(error);
    if (/Could not resolve authentication method/.test(message)) {
      return { error: 'Anthropic API 인증 정보가 없어 AI 추천을 건너뛰었습니다(ANTHROPIC_API_KEY 또는 ant auth login 필요).' };
    }
    return { error: message };
  }
}
