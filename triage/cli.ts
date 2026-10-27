/**
 * npm run triage
 * report/tc-summary.json을 읽어 실패 원인 후보를 report/tc-triage.json에 따로 쓴다.
 * GEMINI_API_KEY(기본) 또는 ANTHROPIC_API_KEY가 없으면 규칙 기반 후보만 만든다.
 * TRIAGE_PROVIDER, TRIAGE_MODEL로 제공자와 모델을 바꿀 수 있다.
 */
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { aiConfigFromEnv } from './ai';
import { buildTriageInputs, readSummary } from './input';
import { triage } from './triage';
import { CATEGORY_LABEL, type TriageReport } from './types';

export function markdownSummary(report: TriageReport): string {
  const lines = ['## 실패 원인 후보 (참고용)', '', `모델: ${report.model ?? '없음 (규칙 기반만)'}`, ''];
  if (report.items.length === 0) return [...lines, '분류할 실패가 없습니다.'].join('\n');
  lines.push('| TC | 결과 | 규칙 기반 | AI | AI 근거 |', '|---|---|---|---|---|');
  for (const item of report.items) {
    const ai = item.ai ? `${CATEGORY_LABEL[item.ai.category]} (${item.ai.confidence})` : (item.aiError ? '오류' : '-');
    const evidence = item.ai?.evidence[0]?.replace(/\|/g, '\\|').slice(0, 120) ?? '';
    lines.push(`| ${item.tcId} | ${item.result} | ${CATEGORY_LABEL[item.rule.category]} | ${ai} | ${evidence} |`);
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const source = path.resolve(process.argv[2] ?? 'report/tc-summary.json');
  if (!existsSync(source)) throw new Error(`${source}가 없습니다. 먼저 테스트를 실행하세요.`);
  const report = await triage(buildTriageInputs(readSummary(source)), path.relative(process.cwd(), source), {
    ai: aiConfigFromEnv(),
  });
  mkdirSync(path.dirname(source), { recursive: true });
  const target = path.join(path.dirname(source), 'tc-triage.json');
  writeFileSync(target, JSON.stringify(report, null, 2));
  const summary = markdownSummary(report);
  console.log(summary);
  console.log(`\n저장: ${path.relative(process.cwd(), target)}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}

if (require.main === module) {
  main().catch(error => { console.error(error); process.exitCode = 2; });
}
