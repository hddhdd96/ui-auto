/**
 * npm run triage:lab [-- --only P1,S2]
 * 일부러 만든 실패 15개를 하나씩 재현하고, 첫 실패를 규칙 기반·AI로 분류해 정답과 비교한다.
 * GEMINI_API_KEY(기본) 또는 ANTHROPIC_API_KEY가 없으면 규칙 기반만 측정한다. 결과: triage-lab/results/
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aiConfigFromEnv } from '../triage/ai';
import { evaluate, evaluationMarkdown, type LabOutcome } from '../triage/evaluate';
import { buildTriageInputs, readSummary } from '../triage/input';
import { triage } from '../triage/triage';
import type { TriageInput } from '../triage/types';
import { LAB_CASES, type LabCase } from './cases';

const ROOT = path.resolve(__dirname, '..');
const RESULTS = path.join(ROOT, 'triage-lab', 'results');
const SUMMARY = path.join(ROOT, 'report', 'tc-summary.json');

function runPlaywright(args: string[], env: Record<string, string> = {}) {
  rmSync(path.join(ROOT, 'report'), { recursive: true, force: true });
  rmSync(path.join(ROOT, 'test-results'), { recursive: true, force: true });
  return spawnSync('npx', ['playwright', 'test', ...args], {
    cwd: ROOT, encoding: 'utf8', timeout: 240_000, env: { ...process.env, CI: '1', ...env },
  });
}

/** 케이스 하나를 재현하고 분류할 첫 실패를 고른다. FAIL을 BLOCK보다 우선한다. */
function reproduce(labCase: LabCase, emptyDir: string): { input: TriageInput | null; problem?: string; log: string } {
  const resolveEnv = (env?: Record<string, string>) =>
    Object.fromEntries(Object.entries(env ?? {}).map(([key, value]) => [key, value === '__EMPTY_DIR__' ? emptyDir : value]));
  if (labCase.prepare) {
    const prepared = runPlaywright(labCase.prepare.args, resolveEnv(labCase.prepare.env));
    if (prepared.status !== 0) return { input: null, problem: '준비 실행 실패', log: prepared.stdout + prepared.stderr };
  }
  const run = runPlaywright(labCase.args, resolveEnv(labCase.env));
  const log = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  if (run.status === 0) return { input: null, problem: '실패가 재현되지 않음(테스트 통과)', log };
  if (!existsSync(SUMMARY)) return { input: null, problem: 'tc-summary.json 없음', log };
  const inputs = buildTriageInputs(readSummary(SUMMARY), ROOT);
  const input = inputs.find(candidate => candidate.result === 'FAIL') ?? inputs[0] ?? null;
  return { input, problem: input ? undefined : '오류가 기록된 실패 행 없음', log };
}

async function main(): Promise<void> {
  const onlyIndex = process.argv.indexOf('--only');
  const only = onlyIndex > 0 ? new Set(process.argv[onlyIndex + 1].split(',')) : null;
  const cases = LAB_CASES.filter(labCase => !only || only.has(labCase.id));
  const ai = process.argv.includes('--no-ai') ? null : aiConfigFromEnv();
  rmSync(RESULTS, { recursive: true, force: true });
  mkdirSync(RESULTS, { recursive: true });
  const emptyDir = mkdtempSync(path.join(os.tmpdir(), 'no-browsers-'));

  const reproduced: { labCase: LabCase; input: TriageInput | null; problem?: string }[] = [];
  for (const labCase of cases) {
    const started = Date.now();
    const { input, problem, log } = reproduce(labCase, emptyDir);
    writeFileSync(path.join(RESULTS, `${labCase.id}.log`), log);
    writeFileSync(path.join(RESULTS, `${labCase.id}.input.json`), JSON.stringify(input, null, 2));
    console.log(`[${labCase.id}] ${problem ?? `재현됨: ${input?.tcId}`} (${Math.round((Date.now() - started) / 1000)}s)`);
    reproduced.push({ labCase, input, problem });
  }

  const inputs = reproduced.flatMap(entry => (entry.input ? [entry.input] : []));
  const report = await triage(inputs, 'triage-lab', { ai });
  // 증적 보강 효과: 같은 실패를 네트워크 기록 없이 한 번 더 분류한다(AI 사용 시에만).
  const withoutNetwork = ai
    ? await triage(inputs.map(input => ({ ...input, network: '' })), 'triage-lab', { ai })
    : null;
  let next = 0;
  const outcomes: LabOutcome[] = reproduced.map(({ labCase, input, problem }) => {
    const index = input ? next++ : -1;
    const ablated = withoutNetwork && index >= 0 ? withoutNetwork.items[index] : null;
    return {
      id: labCase.id, expected: labCase.expected, description: labCase.description,
      item: index >= 0 ? report.items[index] : null, problem,
      aiWithoutNetwork: ablated ? ablated.ai?.category ?? (ablated.aiError ? 'unknown' : null) : undefined,
    };
  });

  const markdown = evaluationMarkdown(outcomes, report.model);
  writeFileSync(path.join(RESULTS, 'triage.json'), JSON.stringify(report, null, 2));
  writeFileSync(path.join(RESULTS, 'evaluation.json'), JSON.stringify({ model: report.model, ...evaluate(outcomes), outcomes }, null, 2));
  writeFileSync(path.join(RESULTS, 'evaluation.md'), `${markdown}\n`);
  console.log(`\n${markdown}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  rmSync(emptyDir, { recursive: true, force: true });
}

main().catch(error => { console.error(error); process.exitCode = 2; });
