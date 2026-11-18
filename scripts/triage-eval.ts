/**
 * 실패 원인 분류기 정확도 측정.
 * tests/triage/labels.json의 시나리오를 실제로 실행해 실패를 만들고, 분류 결과를 정답과 비교한다.
 * 정확도는 이 저장소에서 실제로 실행한 결과로만 계산한다.
 *
 * 사용법: npm run triage:eval
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CATEGORY_LABEL, triage } from '../harness/triage/cli';

interface Label { category: string; why: string }
interface Scenario { name: string; projects: string[]; grep: string; env: Record<string, string>; labels: Record<string, Label> }

const root = path.resolve(import.meta.dirname, '..');
const { scenarios } = JSON.parse(readFileSync(path.join(root, 'tests/triage/labels.json'), 'utf8')) as { scenarios: Scenario[] };
const outDir = path.join(root, 'artifacts', 'triage-eval');
mkdirSync(outDir, { recursive: true });

interface Row { scenario: string; tcId: string; expected: string; predicted: string; ruleId: string; confidence: string; why: string }
const rows: Row[] = [];
let port = 4400;

for (const [index, scenario] of scenarios.entries()) {
  port += 1;
  const jsonFile = path.join(outDir, `scenario-${index + 1}.json`);
  rmSync(jsonFile, { force: true });
  console.log(`▶ ${scenario.name}`);
  spawnSync('npx', ['playwright', 'test', ...scenario.projects.map((p) => `--project=${p}`), '--grep', scenario.grep, '--reporter=json', '--trace=off'], {
    cwd: root,
    env: { ...process.env, ...scenario.env, PORTAL_PORT: String(port), PLAYWRIGHT_JSON_OUTPUT_NAME: jsonFile },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  if (!existsSync(jsonFile)) {
    for (const [tcId, label] of Object.entries(scenario.labels)) rows.push({ scenario: scenario.name, tcId, expected: label.category, predicted: 'notrun', ruleId: '-', confidence: '-', why: label.why });
    continue;
  }
  const { rows: triaged } = await triage(jsonFile, root);
  for (const [tcId, label] of Object.entries(scenario.labels)) {
    const found = triaged.find((r) => r.tcId === tcId);
    rows.push({
      scenario: scenario.name, tcId, expected: label.category,
      // 라벨은 있는데 실패하지 않았으면 분류 대상이 아니므로 따로 센다.
      predicted: found?.category ?? 'not-failed',
      ruleId: found?.ruleId ?? '-',
      confidence: found ? (found.confidence === 'high' ? '높음' : '낮음') : '-',
      why: label.why,
    });
  }
}

const classified = rows.filter((r) => !['notrun', 'not-failed'].includes(r.predicted));
const correct = classified.filter((r) => r.predicted === r.expected).length;
const categories = ['product', 'test', 'env'];
const pct = (a: number, b: number) => (b === 0 ? '-' : `${Math.round((a / b) * 1000) / 10}%`);

const lines = [
  `조건: 라벨 ${rows.length}건, 실행일 ${new Date().toISOString().slice(0, 10)}`,
  '',
  `규칙 기반 분류 정확도: ${correct} / ${classified.length} (${pct(correct, classified.length)})` +
    (rows.length > classified.length ? `, 실패가 일어나지 않았거나 실행되지 않은 라벨 ${rows.length - classified.length}건은 제외` : ''),
  '',
  '| 시나리오 | TC ID | 정답 | 규칙 판정 | 규칙 | 신뢰도 | 일치 |',
  '|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.scenario} | ${r.tcId} | ${CATEGORY_LABEL[r.expected]} | ${CATEGORY_LABEL[r.predicted] ?? r.predicted} | ${r.ruleId} | ${r.confidence} | ${r.predicted === r.expected ? 'O' : 'X'} |`),
  '',
  '분류별 결과(행: 정답, 열: 규칙 판정)',
  '',
  `| 정답 \\ 판정 | ${categories.map((c) => CATEGORY_LABEL[c]).join(' | ')} | 분류 불가 |`,
  `|---|${categories.map(() => '---').join('|')}|---|`,
  ...categories.map((e) => `| ${CATEGORY_LABEL[e]} | ${[...categories, 'unknown'].map((p) => classified.filter((r) => r.expected === e && r.predicted === p).length).join(' | ')} |`),
];
const summary = lines.join('\n');
writeFileSync(path.join(outDir, 'summary.md'), `${summary}\n`);
writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({ rows, correct, classified: classified.length }, null, 2));
console.log(`\n${summary}`);
