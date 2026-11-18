/**
 * 실패 원인 자동 분류 실행기.
 * Playwright JSON 결과를 읽어 실패한 테스트마다 규칙 기반으로 product / test / env를 판정하고,
 * 결과를 artifacts/triage/triage.md, triage.json으로 남긴다. GitHub Actions에서는 Job Summary에도 쓴다.
 *
 * 사용법: npm run triage [-- <results.json> --out <디렉터리>]
 *        TRIAGE_AI=1 npm run triage   (선택: AI 원인 추천을 참고 의견으로 함께 붙임)
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { aiEnabled, recommend } from './ai';
import type { AiRecommendation } from './ai';
import { classify } from './classify';
import type { Classification } from './classify';
import { loadReport } from './report';
import type { RunSummary } from './report';

export const CATEGORY_LABEL: Record<string, string> = {
  product: '제품 결함(product)', test: '테스트 코드(test)', env: '환경(env)', unknown: '분류 불가',
};

export type TriageRow = Classification & { ai?: AiRecommendation | { error: string } };

const escape = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function renderMarkdown(rows: TriageRow[], summary: RunSummary, title = '실패 원인 자동 분류'): string {
  const count = (c: string) => rows.filter((r) => r.category === c).length;
  const withAi = rows.some((r) => r.ai);
  const lines = [
    `## ${title}`,
    '',
    `전체 ${summary.total}건 · 통과 ${summary.passed} · 실패 ${summary.failed} · 재시도 후 통과(flaky) ${summary.flaky} · 실행 안 됨(Not Run) ${summary.notRun}`,
    '',
  ];
  if (rows.length === 0) return [...lines, '실패한 테스트가 없습니다.'].join('\n');
  lines.push(
    `분류 결과: 제품 결함 ${count('product')} · 테스트 코드 ${count('test')} · 환경 ${count('env')} · 분류 불가 ${count('unknown')}`,
    '',
    `| TC ID | 프로젝트 | 분류 | 규칙 | 신뢰도 | 판정 근거 |${withAi ? ' AI 추천(참고) |' : ''}`,
    `|---|---|---|---|---|---|${withAi ? '---|' : ''}`,
    ...rows.map((r) => {
      const ai = !r.ai ? '' : 'error' in r.ai ? ` 추천 없음: ${escape(r.ai.error)} |` : ` ${CATEGORY_LABEL[r.ai.category]}${r.ai.category === r.category ? '' : ' (규칙과 다름)'} |`;
      return `| ${r.tcId} | ${r.project} | ${CATEGORY_LABEL[r.category]} | ${r.ruleId ?? '-'} | ${r.confidence === 'high' ? '높음' : '낮음'} | ${escape(r.reason)} |${withAi ? ai : ''}`;
    }),
    '',
    '### 실패별 증적',
  );
  for (const r of rows) {
    lines.push('', `**${r.tcId}** ${escape(r.title.slice(r.tcId.length).trim())}`, '');
    lines.push(...r.evidence.map((e) => `- ${e}`));
    for (const c of r.counterEvidence) lines.push(`- 반대 증거(${CATEGORY_LABEL[c.category]}, ${c.ruleId}): ${c.evidence.join(' / ')}`);
    if (r.ai && !('error' in r.ai)) lines.push(`- AI 추천(${r.ai.model}): ${r.ai.reason} 다음 조치: ${r.ai.nextAction}`);
  }
  return lines.join('\n');
}

export async function triage(jsonFile: string, root: string, useAi = aiEnabled()) {
  const { failures, summary } = loadReport(jsonFile, root);
  const rows: TriageRow[] = [];
  for (const failure of failures) {
    const row: TriageRow = classify(failure);
    if (useAi) row.ai = await recommend(failure, row);
    rows.push(row);
  }
  return { rows, summary, failures };
}

async function main() {
  const root = path.resolve(import.meta.dirname, '..', '..');
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const outDir = path.resolve(root, outIndex >= 0 ? args[outIndex + 1]! : 'artifacts/triage');
  const jsonFile = path.resolve(root, args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out') ?? 'artifacts/results.json');

  const { rows, summary } = await triage(jsonFile, root);
  const markdown = renderMarkdown(rows, summary);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'triage.md'), `${markdown}\n`);
  writeFileSync(path.join(outDir, 'triage.json'), JSON.stringify({ summary, rows }, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  console.log(markdown);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await main();
}
