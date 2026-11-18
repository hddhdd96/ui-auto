/**
 * 테스트 하네스: 환경 선택 → 테스트 실행 → 증적 수집 → 실패 원인 분류 → Excel·PPT 결과서 작성을 한 번에 한다.
 *
 * 사용법:
 *   npm run harness                                   # 터미널에서 환경·프로젝트를 번호로 고른다(하나뿐이면 자동 선택)
 *   npm run harness -- --env local --project proj-beta --suites api,ui
 *   npm run harness -- --base-url http://127.0.0.1:4173   # 이미 떠 있는 포털을 대상으로 한다
 *
 * 옵션: --env <환경 ID> --project <프로젝트 ID> --suites <프로젝트 목록> --port <포털 포트>
 *       --base-url <포털 주소> --no-report(결과서 생략) --allow-fail(테스트가 실패해도 종료 코드 0)
 */
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { testConfig } from '../src/config';
import { collectTests } from './collect';
import { triage } from './triage/cli';

interface Environment { id: string; name: string; baseUrl: string; description?: string }
interface Project { id: string; name: string }

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const flag = (name: string) => args.includes(`--${name}`);
const DEFAULT_SUITES = ['api', 'ui', 'negative', 'defects'];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function isUp(baseUrl: string): Promise<boolean> {
  try {
    return (await fetch(`${baseUrl}/api/health`)).ok;
  } catch {
    return false;
  }
}

/** 포털이 떠 있지 않으면 직접 띄우고, 상태 확인 API가 응답할 때까지 기다린다. */
async function ensurePortal(baseUrl: string, port: string): Promise<ChildProcess | null> {
  if (await isUp(baseUrl)) return null;
  console.log(`포털이 떠 있지 않아 직접 띄웁니다: ${baseUrl}`);
  const child = spawn('npx', ['tsx', 'portal/server/main.ts'], {
    cwd: root,
    env: { ...process.env, PORTAL_PORT: port, TRANSITION_DELAY_MS: process.env.TRANSITION_DELAY_MS ?? '300' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i += 1) {
    if (await isUp(baseUrl)) return child;
    await sleep(200);
  }
  child.kill();
  throw new Error(`포털이 20초 안에 뜨지 않았습니다: ${baseUrl}`);
}

/** 목록에서 하나를 고른다. 옵션으로 정했으면 그 값, 하나뿐이면 그것, 터미널이면 번호로 묻고, 아니면 첫 번째. */
async function choose<T extends { id: string; name: string }>(label: string, items: T[], wanted?: string): Promise<T> {
  if (items.length === 0) throw new Error(`선택할 ${label}이(가) 없습니다.`);
  if (wanted) {
    const found = items.find((item) => item.id === wanted);
    if (!found) throw new Error(`${label} '${wanted}'를 찾을 수 없습니다. 선택 가능: ${items.map((i) => i.id).join(', ')}`);
    return found;
  }
  if (items.length === 1 || !process.stdin.isTTY) return items[0]!;
  console.log(`\n${label}을(를) 고르세요.`);
  items.forEach((item, index) => console.log(`  ${index + 1}) ${item.name} (${item.id})`));
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('번호 [1]: ');
  rl.close();
  return items[Number(answer || '1') - 1] ?? items[0]!;
}

async function getJson<T>(url: string, token?: string, projectId?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (projectId) headers['x-project-id'] = projectId;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`GET ${url} 실패: HTTP ${response.status}`);
  return (await response.json()) as T;
}

const git = (...gitArgs: string[]) => spawnSync('git', gitArgs, { cwd: root, encoding: 'utf8' }).stdout.trim() || null;

async function main() {
  const port = option('port') ?? process.env.PORTAL_PORT ?? '4173';
  const portalUrl = (option('base-url') ?? `http://127.0.0.1:${port}`).replace(/\/$/, '');
  const suites = (option('suites') ?? DEFAULT_SUITES.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
  const portal = await ensurePortal(portalUrl, port);

  try {
    // 1. 환경 정보는 API로 불러와 고른다. 주소·프로젝트를 설정 파일에 직접 적지 않아도 된다.
    const environment = await choose('테스트 환경', await getJson<Environment[]>(`${portalUrl}/api/environments`), option('env'));
    const login = await fetch(`${environment.baseUrl}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(testConfig.admin),
    });
    if (!login.ok) throw new Error(`관리자 로그인 실패: HTTP ${login.status}`);
    const { token } = (await login.json()) as { token: string };
    const project = await choose('프로젝트', await getJson<Project[]>(`${environment.baseUrl}/api/projects`, token), option('project'));
    const flags = await getJson<Record<string, unknown>>(`${environment.baseUrl}/api/test/flags`);

    const startedAt = new Date();
    const runId = startedAt.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
    const runDir = path.join(root, 'artifacts', 'harness', runId);
    mkdirSync(runDir, { recursive: true });
    console.log(`\n대상 포털: ${environment.name} (${environment.baseUrl})\n프로젝트: ${project.name} (${project.id})\n스위트: ${suites.join(', ')}\n결과 디렉터리: ${path.relative(root, runDir)}\n`);

    // 2. 테스트 실행. 모든 UI 테스트의 마지막 화면을 스크린샷 증적으로 남긴다.
    const jsonFile = path.join(runDir, 'results.json');
    const run = spawnSync('npx', ['playwright', 'test', ...suites.map((s) => `--project=${s}`), '--reporter=list,json,html'], {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        BASE_URL: environment.baseUrl,
        PROJECT_ID: project.id,
        HARNESS_SCREENSHOT: 'on',
        PLAYWRIGHT_JSON_OUTPUT_NAME: jsonFile,
        PLAYWRIGHT_HTML_OUTPUT_DIR: path.join(runDir, 'html-report'),
        PLAYWRIGHT_HTML_OPEN: 'never',
      },
    });
    const finishedAt = new Date();

    // 3. 증적 수집과 실패 원인 분류
    const tests = collectTests(jsonFile, runDir);
    const { rows: triaged } = await triage(jsonFile, root);
    const count = (status: string) => tests.filter((t) => t.status === status).length;
    const executed = tests.length - count('notrun');
    const reportData = {
      run: {
        id: runId,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationSec: Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000),
        gitBranch: git('rev-parse', '--abbrev-ref', 'HEAD'),
        gitCommit: git('rev-parse', '--short', 'HEAD'),
        exitCode: run.status,
      },
      environment,
      project,
      account: testConfig.admin.username,
      portalMode: flags,
      suites,
      summary: {
        total: tests.length, passed: count('passed'), failed: count('failed'), flaky: count('flaky'), notRun: count('notrun'),
        passRate: executed === 0 ? 0 : Math.round((count('passed') / executed) * 1000) / 10,
      },
      bySuite: suites.map((suite) => {
        const mine = tests.filter((t) => t.suite === suite);
        return { suite, total: mine.length, passed: mine.filter((t) => t.status === 'passed').length, failed: mine.filter((t) => t.status === 'failed').length, flaky: mine.filter((t) => t.status === 'flaky').length, notRun: mine.filter((t) => t.status === 'notrun').length };
      }),
      tests: tests.map((t) => {
        const found = triaged.find((r) => r.tcId === t.tcId && r.project === t.suite);
        return { ...t, triage: found ? { category: found.category, ruleId: found.ruleId, reason: found.reason, confidence: found.confidence, evidence: found.evidence } : null };
      }),
    };
    const dataFile = path.join(runDir, 'report-data.json');
    writeFileSync(dataFile, JSON.stringify(reportData, null, 2));

    // 4. Excel·PPT 결과서
    if (!flag('no-report')) {
      const python = spawnSync('python3', [path.join(root, 'harness', 'report', 'make_reports.py'), dataFile], { cwd: root, stdio: 'inherit' });
      if (python.status !== 0) throw new Error('결과서 생성에 실패했습니다.');
    }
    writeFileSync(path.join(root, 'artifacts', 'harness', 'latest.txt'), `${runId}\n`);

    const s = reportData.summary;
    console.log(`\n결과: 전체 ${s.total} · 통과 ${s.passed} · 실패 ${s.failed} · flaky ${s.flaky} · Not Run ${s.notRun} (통과율 ${s.passRate}%)`);
    console.log(`결과 디렉터리: ${path.relative(root, runDir)}`);
    if (run.status !== 0 && !flag('allow-fail')) process.exitCode = run.status ?? 1;
  } finally {
    portal?.kill();
  }
}

await main();
