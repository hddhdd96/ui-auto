/**
 * Flaky 개선 전/후 비교 스크립트.
 * 유형마다 naive(개선 전)와 stable(개선 후)을 같은 Flaky 플래그·같은 시드로 N회씩 실행하고,
 * 실행 횟수·실패 횟수·Not Run·실패율을 표로 만든다. 회차마다 포털을 새로 띄워 앞 회차의 영향을 받지 않게 한다.
 *
 * 사용법:
 *   npm run flaky:compare                       # 기본: 5회, 확률 0.5, 시드 1001~1005
 *   npm run flaky:compare -- --runs 10 --rate 0.3
 *   npm run flaky:compare -- --demo             # 5분 데모용: 확률 1.0, 시드 고정, 3회 → 매번 같은 결과
 *   npm run flaky:compare -- --only FLAKY-DEL-001
 *
 * 판정: stable이 한 번이라도 실패하거나 실행되지 않으면(Not Run) 종료 코드 1.
 *       naive가 한 번도 실패하지 않으면 재현이 안 된 것이므로 경고를 남긴다(종료 코드는 0).
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

interface FlakyType { type: string; tcId: string; env: Record<string, string> }
interface JsonResult { status: string; error?: { message?: string } }
interface JsonSpec { title: string; tests: { results: JsonResult[] }[] }
interface JsonSuite { specs?: JsonSpec[]; suites?: JsonSuite[] }

type Outcome = 'passed' | 'failed' | 'notrun';
interface RunRecord { tcId: string; variant: 'naive' | 'stable'; run: number; seed: number; outcome: Outcome; error?: string }

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const demo = args.includes('--demo');
const runs = Number(option('runs') ?? process.env.FLAKY_RUNS ?? (demo ? 3 : 5));
const rate = option('rate') ?? (demo ? '1' : process.env.FLAKY_RATE ?? '0.5');
const baseSeed = Number(option('seed') ?? (demo ? 7 : 1000));
const only = option('only');

const { types } = JSON.parse(readFileSync(path.join(root, 'tests/flaky/flaky-types.json'), 'utf8')) as { types: FlakyType[] };
const selected = types.filter((t) => !only || t.tcId === only);
const allFlags = [...new Set(types.flatMap((t) => Object.keys(t.env)))];
const outDir = path.join(root, 'artifacts', 'flaky-compare');
mkdirSync(outDir, { recursive: true });

function collectSpecs(suite: JsonSuite, into: JsonSpec[] = []): JsonSpec[] {
  into.push(...(suite.specs ?? []));
  for (const child of suite.suites ?? []) collectSpecs(child, into);
  return into;
}

/** 한 회차를 실행하고 결과를 돌려준다. 결과 파일이 없거나 테스트가 실행되지 않았으면 Not Run이다. */
function runOnce(flakyType: FlakyType, variant: 'naive' | 'stable', run: number, port: number): RunRecord {
  // 데모는 회차마다 같은 시드를 쓰고, 일반 비교는 회차마다 시드를 바꾼다. naive와 stable은 같은 회차에 같은 시드를 쓴다.
  const seed = demo ? baseSeed : baseSeed + run;
  const jsonFile = path.join(outDir, `${flakyType.tcId}-${variant}-${run}.json`);
  rmSync(jsonFile, { force: true });
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...Object.fromEntries(allFlags.map((flag) => [flag, 'false'])),
    ...flakyType.env,
    FLAKY_RATE: rate,
    FLAKY_SEED: String(seed),
    PORTAL_PORT: String(port),
    PLAYWRIGHT_JSON_OUTPUT_NAME: jsonFile,
  };
  spawnSync('npx', ['playwright', 'test', `--project=flaky-${variant}`, '--grep', flakyType.tcId, '--reporter=json', '--trace=off'], {
    cwd: root, env, stdio: ['ignore', 'ignore', 'ignore'],
  });
  const base = { tcId: flakyType.tcId, variant, run, seed };
  if (!existsSync(jsonFile)) return { ...base, outcome: 'notrun', error: '결과 파일이 없습니다(실행 자체가 실패).' };
  const spec = collectSpecs(JSON.parse(readFileSync(jsonFile, 'utf8')) as JsonSuite).find((s) => s.title.startsWith(flakyType.tcId));
  const result = spec?.tests[0]?.results.at(-1);
  if (!result || result.status === 'skipped') return { ...base, outcome: 'notrun', error: '테스트가 실행되지 않았습니다.' };
  if (result.status === 'passed') return { ...base, outcome: 'passed' };
  // 터미널 색상 코드(ESC[...m)를 지운 첫 줄만 남긴다.
  const message = (result.error?.message ?? result.status).replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '').split('\n')[0];
  return { ...base, outcome: 'failed', error: message };
}

const records: RunRecord[] = [];
let port = 4300;
console.log(`Flaky 비교 실행: ${runs}회, 확률 ${rate}, 시드 ${demo ? `${baseSeed}(고정)` : `${baseSeed + 1}~${baseSeed + runs}`}`);
for (const flakyType of selected) {
  for (const variant of ['naive', 'stable'] as const) {
    for (let run = 1; run <= runs; run += 1) {
      port += 1;
      const record = runOnce(flakyType, variant, run, port);
      records.push(record);
      console.log(`  ${flakyType.tcId} ${variant} #${run} (seed ${record.seed}): ${record.outcome}${record.error ? ` - ${record.error}` : ''}`);
    }
  }
}

const percent = (failed: number, executed: number) => (executed === 0 ? '-' : `${Math.round((failed / executed) * 100)}%`);
const rows = selected.flatMap((t) => (['naive', 'stable'] as const).map((variant) => {
  const mine = records.filter((r) => r.tcId === t.tcId && r.variant === variant);
  const failed = mine.filter((r) => r.outcome === 'failed').length;
  const notRun = mine.filter((r) => r.outcome === 'notrun').length;
  const executed = mine.length - notRun;
  return { type: t.type, tcId: t.tcId, flags: Object.keys(t.env).join(', '), variant, executed, failed, notRun, rate: percent(failed, executed) };
}));

const table = [
  '| 유형 | TC ID | Flaky 플래그 | 테스트 | 실행 | 실패 | Not Run | 실패율 |',
  '|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.type} | ${r.tcId} | \`${r.flags}\` | ${r.variant === 'naive' ? '개선 전(naive)' : '개선 후(stable)'} | ${r.executed} | ${r.failed} | ${r.notRun} | ${r.rate} |`),
].join('\n');
const condition = `조건: 회차 ${runs}회, Flaky 확률 ${rate}, 시드 ${demo ? `${baseSeed} 고정` : `${baseSeed + 1}~${baseSeed + runs}`}, 실행일 ${new Date().toISOString().slice(0, 10)}`;
writeFileSync(path.join(outDir, 'summary.md'), `${condition}\n\n${table}\n`);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Flaky 개선 전/후 비교\n\n${condition}\n\n${table}\n`);
}
writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({ runs, rate, baseSeed, demo, rows, records }, null, 2));
console.log(`\n${condition}\n\n${table}\n`);

const stableBad = rows.filter((r) => r.variant === 'stable' && (r.failed > 0 || r.notRun > 0));
const naiveQuiet = rows.filter((r) => r.variant === 'naive' && r.failed === 0);
if (naiveQuiet.length > 0) console.warn(`경고: naive가 한 번도 실패하지 않은 유형이 있습니다(재현 안 됨): ${naiveQuiet.map((r) => r.tcId).join(', ')}`);
if (stableBad.length > 0) {
  console.error(`stable이 실패했거나 실행되지 않았습니다: ${stableBad.map((r) => r.tcId).join(', ')}`);
  process.exit(1);
}
console.log('stable은 모든 회차에서 통과했습니다.');
