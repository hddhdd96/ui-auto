/**
 * 결함 검출 확인 스크립트.
 * 결함 주입 모드마다 포털을 새로 띄워 결함 재현 테스트(defects 프로젝트)를 실행하고,
 *   - 정상 모드에서는 모든 테스트가 통과하는지
 *   - 결함 모드에서는 기대한 테스트가 정확히 실패하는지(결함을 검출하는지, 다른 테스트는 통과하는지)
 * 를 확인한다. 하나라도 어긋나면 종료 코드 1로 끝난다.
 *
 * 사용법: npm run defects:check            (모든 모드)
 *        npm run defects:check -- normal   (특정 모드만)
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

interface Mode { env: Record<string, string>; mustFail: string[] }
interface Expected { modes: Record<string, Mode> }

interface JsonSpec { title: string; ok: boolean }
interface JsonSuite { specs?: JsonSpec[]; suites?: JsonSuite[] }

const root = path.resolve(import.meta.dirname, '..');
const expected = JSON.parse(readFileSync(path.join(root, 'tests/defects/expected-detection.json'), 'utf8')) as Expected;
const selected = process.argv.slice(2);
const modeNames = Object.keys(expected.modes).filter((name) => selected.length === 0 || selected.includes(name));
const outDir = path.join(root, 'artifacts', 'defect-detection');
mkdirSync(outDir, { recursive: true });

function collectSpecs(suite: JsonSuite, into: JsonSpec[] = []): JsonSpec[] {
  into.push(...(suite.specs ?? []));
  for (const child of suite.suites ?? []) collectSpecs(child, into);
  return into;
}

const tcId = (title: string) => title.split(' ')[0] ?? title;
const allFlags = ['DEFECT_QUOTA_API_BYPASS', 'DEFECT_RESIZE_MISMATCH'];

const rows: { mode: string; total: number; failed: string[]; mustFail: string[]; ok: boolean }[] = [];
let port = 4180;

for (const name of modeNames) {
  const mode = expected.modes[name]!;
  const jsonFile = path.join(outDir, `${name}.json`);
  // 모드마다 다른 포트를 써서, 다른 모드로 떠 있는 포털을 재사용하지 않게 한다.
  port += 1;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...Object.fromEntries(allFlags.map((flag) => [flag, 'false'])),
    ...mode.env,
    PORTAL_PORT: String(port),
    PLAYWRIGHT_JSON_OUTPUT_NAME: jsonFile,
  };
  console.log(`\n▶ ${name} 모드 실행 (포트 ${port}, ${JSON.stringify(mode.env)})`);
  spawnSync('npx', ['playwright', 'test', '--project=defects', '--reporter=json', '--trace=off'], {
    cwd: root, env, stdio: ['ignore', 'ignore', 'inherit'],
  });

  const specs = collectSpecs(JSON.parse(readFileSync(jsonFile, 'utf8')) as JsonSuite);
  const failed = specs.filter((s) => !s.ok).map((s) => tcId(s.title)).sort();
  const mustFail = [...mode.mustFail].sort();
  const ok = specs.length > 0 && JSON.stringify(failed) === JSON.stringify(mustFail);
  rows.push({ mode: name, total: specs.length, failed, mustFail, ok });
}

const lines = [
  '| 모드 | 실행 | 실패(검출) | 기대한 실패 | 판정 |',
  '|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.mode} | ${r.total} | ${r.failed.join(', ') || '없음'} | ${r.mustFail.join(', ') || '없음'} | ${r.ok ? '일치' : '불일치'} |`),
];
const summary = lines.join('\n');
writeFileSync(path.join(outDir, 'summary.md'), `${summary}\n`);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## 결함 검출 확인\n\n결함 주입 모드에서 결함 재현 테스트가 기대한 결함을 정확히 검출했는지(=기대한 테스트만 실패했는지) 확인한 결과입니다.\n\n${summary}\n`);
}
console.log(`\n${summary}`);

if (rows.some((r) => !r.ok)) {
  console.error('\n결함 검출 결과가 기대와 다릅니다.');
  process.exit(1);
}
console.log('\n모든 모드에서 결함 검출 결과가 기대와 일치합니다.');
