import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { TriageInput } from './types';

type SummaryRow = {
  tcId: string; title: string; result: 'PASS' | 'FAIL' | 'BLOCK'; summary: string;
  errors: { message?: string; snippet?: string; location?: { file?: string; line?: number } }[];
  attachments: string[];
};

const ANSI = /\u001b\[[0-9;]*m/g;
const MAX_MESSAGE = 2_500;
const MAX_SNIPPET = 1_200;
const MAX_SNAPSHOT = 2_000;
const MAX_NETWORK = 1_500;
const MAX_TEST_CODE = 1_500;

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '');
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n…(생략)` : text;
}

/**
 * error-context.md에서 페이지 스냅샷(yaml 블록)만 꺼낸다. 테스트 파일 정보·소스는 제외한다.
 * 모달이 열려 있으면 Playwright가 '# Page snapshot' 절 없이 오류 상세 아래에 yaml 블록으로 쓴다.
 */
export function pageSnapshotFrom(markdown: string): string {
  const blocks = [...markdown.matchAll(/```yaml\n([\s\S]*?)```/g)].map(match => match[1].trim());
  return clip(blocks.join('\n'), MAX_SNAPSHOT);
}

type NetworkLogFile = {
  problems: { method: string; path: string; status?: number; body?: string; failure?: string; durationMs?: number }[];
  pending: { method: string; path: string; pendingMs: number }[];
};

export function networkFrom(json: string): string {
  const log = JSON.parse(json) as NetworkLogFile;
  const lines = [
    ...log.problems.map(entry => {
      const outcome = entry.status !== undefined ? String(entry.status)
        : entry.failure !== undefined ? `failed: ${entry.failure}` : `completed after ${entry.durationMs}ms`;
      return `${entry.method} ${entry.path} -> ${outcome}${entry.body ? ` ${entry.body}` : ''}`;
    }),
    ...log.pending.map(entry => `${entry.method} ${entry.path} -> still pending after ${entry.pendingMs}ms`),
  ];
  return clip(lines.join('\n'), MAX_NETWORK);
}

/**
 * 테스트 함수 본문을 꺼낸다. 사람이 원인을 볼 때처럼 테스트가 넣은 값과 기대한 값을 확인하기 위한 것이다.
 * TC-ID·태그가 들어 있는 줄은 분류 힌트가 되지 않도록 뺀다.
 */
export function testCodeFrom(source: string, testName: string): string {
  const lines = source.split('\n');
  const quoted = [`'${testName}'`, `"${testName}"`, `\`${testName}\``];
  const start = lines.findIndex(line => /^(test|setup|it)\s*\(/.test(line.trim()) && quoted.some(q => line.includes(q)));
  if (start < 0) return '';
  const end = lines.findIndex((line, index) => index > start && /^\}\);?\s*$/.test(line));
  const body = lines.slice(start, end < 0 ? undefined : end + 1)
    .filter(line => !/tc-id|\btag\s*:/.test(line));
  return clip(body.join('\n'), MAX_TEST_CODE);
}

function readTestCode(title: string, root: string): string {
  const segments = title.split(' > ').map(segment => segment.trim());
  const file = segments.find(segment => /\.(spec|setup)\.ts$/.test(segment));
  const testName = segments.at(-1) ?? '';
  if (!file) return '';
  for (const candidate of [path.resolve(root, file), path.resolve(root, 'auth', path.basename(file))]) {
    if (existsSync(candidate)) return testCodeFrom(readFileSync(candidate, 'utf8'), testName);
  }
  return '';
}

/** Playwright는 path 첨부를 '이름-해시.확장자'로 복사하므로 파일 이름의 앞부분과 확장자로 찾는다. */
function readAttachment(row: SummaryRow, name: string, extension: string, root: string): string | null {
  const found = row.attachments.find(item => {
    const base = path.basename(item);
    return base.startsWith(name) && base.endsWith(extension);
  });
  const absolute = found ? path.resolve(root, found) : '';
  return absolute && existsSync(absolute) ? readFileSync(absolute, 'utf8') : null;
}

/**
 * tc-summary.json의 FAIL/BLOCK 행 중 오류가 있는 행을 분류 입력으로 바꾼다.
 * 오류 없이 BLOCK인 행(앞 단계 실패로 실행되지 않음)은 원인이 다른 행에 있으므로 제외한다.
 * TC-ID와 파일 경로는 분류 힌트가 되지 않도록 입력에서 제외하고 결과 연결에만 쓴다.
 */
export function buildTriageInputs(rows: SummaryRow[], root = process.cwd()): TriageInput[] {
  return rows
    .filter(row => row.result !== 'PASS' && row.errors.length > 0)
    .map(row => {
      const context = readAttachment(row, 'error-context', '.md', root);
      const network = readAttachment(row, 'network-log', '.json', root);
      return {
        tcId: row.tcId,
        testName: row.title.split(' > ').at(-1)?.trim() ?? row.title,
        result: row.result as 'FAIL' | 'BLOCK',
        errors: row.errors.map(error => ({
          message: clip(stripAnsi(error.message ?? ''), MAX_MESSAGE),
          snippet: clip(stripAnsi(error.snippet ?? ''), MAX_SNIPPET),
          file: path.basename(error.location?.file ?? ''),
          line: error.location?.line,
        })),
        pageSnapshot: context ? pageSnapshotFrom(context) : '',
        network: network ? networkFrom(network) : '',
        testCode: readTestCode(row.title, root),
      };
    });
}

export function readSummary(summaryPath: string): SummaryRow[] {
  return JSON.parse(readFileSync(summaryPath, 'utf8')) as SummaryRow[];
}

/** 근거 검증과 규칙 분류에 쓰는 입력 전체 텍스트. */
export function inputText(input: TriageInput): string {
  return [
    input.testName,
    ...input.errors.flatMap(error => [error.message, error.snippet]),
    input.pageSnapshot,
    input.network,
    input.testCode,
  ].join('\n');
}
