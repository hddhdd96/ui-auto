/**
 * 판정 완화 가드레일 검사.
 * PR의 변경(diff)에서 테스트의 판정 기준을 느슨하게 만드는 변경을 찾아 보고하고, 승인이 없으면 실패한다.
 *
 * 사용법:
 *   npm run guardrail                          # origin/main...HEAD 비교
 *   npm run guardrail -- --base <ref>          # 비교 기준 변경
 *   npm run guardrail -- --diff-file <파일>    # 저장된 diff 검사(자기검증용)
 * 환경변수 GUARDRAIL_APPROVED=true이면 위반을 보고하되 종료 코드 0으로 끝난다(PR에 승인 라벨이 있을 때).
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseDiff } from './diff';
import type { FileDiff } from './diff';
import { PROTECTED_RULE, RULES } from './rules';
import type { Violation } from './rules';

interface Scope { include: string[]; exclude: string[]; protected: string[] }

const root = path.resolve(import.meta.dirname, '..');
const scope = JSON.parse(readFileSync(path.join(import.meta.dirname, 'scope.json'), 'utf8')) as Scope;
const startsWithAny = (file: string, prefixes: string[]) => prefixes.some((p) => file === p || file.startsWith(p));

export function inScope(file: string): boolean {
  return startsWithAny(file, scope.include) && !startsWithAny(file, scope.exclude);
}

export function checkDiff(diff: string): Violation[] {
  const files: FileDiff[] = parseDiff(diff);
  const violations: Violation[] = [];
  for (const file of files) {
    if (startsWithAny(file.path, scope.protected)) {
      violations.push({ ruleId: PROTECTED_RULE.id, file: file.path, line: file.added[0]?.line ?? file.removed[0]?.line ?? 0, detail: `가드레일 관련 파일 변경(+${file.added.length} / -${file.removed.length}줄)` });
      continue;
    }
    if (!inScope(file.path)) continue;
    for (const rule of RULES) violations.push(...rule.check(file));
  }
  return violations;
}

export function renderReport(violations: Violation[], approved: boolean, base: string): string {
  const titles = new Map([...RULES.map((r) => [r.id, r.title] as const), [PROTECTED_RULE.id, PROTECTED_RULE.title]]);
  const lines = ['## 판정 완화 가드레일', '', `비교 기준: \`${base}\``, ''];
  if (violations.length === 0) return [...lines, '판정 기준을 느슨하게 만드는 변경이 없습니다.'].join('\n');
  lines.push(
    approved
      ? `**승인됨**: 위반 ${violations.length}건이 있지만 \`guardrail-approved\` 라벨로 승인되어 통과합니다. PR 설명에 판정 기준을 바꾼 이유가 있어야 합니다.`
      : `**차단**: 판정 기준을 느슨하게 만드는 변경 ${violations.length}건을 찾았습니다. 실패 원인을 고치거나, 요구사항이 바뀐 경우 PR 설명에 이유를 적고 사람이 \`guardrail-approved\` 라벨을 붙여야 합니다.`,
    '',
    '| 규칙 | 파일:줄 | 내용 |',
    '|---|---|---|',
    ...violations.map((v) => `| ${v.ruleId} ${titles.get(v.ruleId) ?? ''} | \`${v.file}:${v.line}\` | ${v.detail.replace(/\|/g, '\\|')} |`),
  );
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const option = (name: string) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const diffFile = option('diff-file');
  const base = option('base') ?? process.env.GUARDRAIL_BASE ?? 'origin/main';
  let diff: string;
  if (diffFile) {
    diff = readFileSync(diffFile, 'utf8');
  } else {
    const git = spawnSync('git', ['diff', '--unified=0', '--no-color', '--no-renames', `${base}...HEAD`], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (git.status !== 0) {
      console.error(`git diff 실패: ${git.stderr}`);
      process.exit(2);
    }
    diff = git.stdout;
  }
  const approved = process.env.GUARDRAIL_APPROVED === 'true';
  const violations = checkDiff(diff);
  const report = renderReport(violations, approved, diffFile ?? `${base}...HEAD`);
  const outDir = path.join(root, 'artifacts', 'guardrail');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'report.md'), `${report}\n`);
  writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ approved, violations }, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
  console.log(report);
  if (violations.length > 0 && !approved) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main();
