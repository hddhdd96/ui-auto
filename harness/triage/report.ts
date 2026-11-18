import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { CauseRecord, HttpRecord, PollRecord } from '../../src/api/evidence';

/** Playwright JSON 결과에서 읽어 온 실패 테스트 한 건과 그 증적 */
export interface FailedTest {
  /** TC ID(제목의 첫 단어). 예: FLAKY-DEL-001 */
  tcId: string;
  title: string;
  project: string;
  file: string;
  tags: string[];
  status: string;
  /** 색상 코드를 지운 오류 메시지 */
  message: string;
  /** 오류가 난 소스 위치 */
  location?: string;
  http: HttpRecord[];
  polls: PollRecord[];
  causes: CauseRecord[];
  flakyEvents: { at: string; type: string; detail: string }[];
  /** 테스트 파일 소스(고정 대기 사용 여부 등을 보는 데 쓴다) */
  source: string;
  screenshots: string[];
}

export interface RunSummary {
  total: number;
  passed: number;
  failed: number;
  /** 실행되지 않은 테스트(skipped) */
  notRun: number;
  flaky: number;
}

interface JsonAttachment { name: string; contentType: string; path?: string; body?: string }
interface JsonResult { status: string; error?: { message?: string; location?: { file: string; line: number } }; attachments: JsonAttachment[] }
interface JsonTest { projectName: string; status: string; results: JsonResult[]; annotations?: unknown[] }
interface JsonSpec { title: string; file: string; tags?: string[]; tests: JsonTest[] }
interface JsonSuite { specs?: JsonSpec[]; suites?: JsonSuite[] }
interface JsonReport { suites: JsonSuite[]; stats?: { expected: number; unexpected: number; skipped: number; flaky: number } }

const ESC = String.fromCharCode(27);
export const stripAnsi = (text: string) => text.replace(new RegExp(`${ESC}\\[[0-9;]*m`, 'g'), '');

function collectSpecs(suites: JsonSuite[], into: JsonSpec[] = []): JsonSpec[] {
  for (const suite of suites) {
    into.push(...(suite.specs ?? []));
    collectSpecs(suite.suites ?? [], into);
  }
  return into;
}

function readAttachment<T>(result: JsonResult, name: string): T | undefined {
  const attachment = result.attachments.find((a) => a.name === name);
  if (!attachment) return undefined;
  try {
    if (attachment.body) return JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8')) as T;
    if (attachment.path && existsSync(attachment.path)) return JSON.parse(readFileSync(attachment.path, 'utf8')) as T;
  } catch {
    return undefined;
  }
  return undefined;
}

/** JSON 결과 파일을 읽어 실패한 테스트와 실행 요약을 돌려준다. */
export function loadReport(jsonFile: string, root: string): { failures: FailedTest[]; summary: RunSummary } {
  const report = JSON.parse(readFileSync(jsonFile, 'utf8')) as JsonReport;
  const failures: FailedTest[] = [];
  const summary: RunSummary = { total: 0, passed: 0, failed: 0, notRun: 0, flaky: 0 };
  const sources = new Map<string, string>();

  for (const spec of collectSpecs(report.suites)) {
    for (const test of spec.tests) {
      summary.total += 1;
      const last = test.results.at(-1);
      if (test.status === 'skipped' || !last || last.status === 'skipped') { summary.notRun += 1; continue; }
      if (test.status === 'expected') { summary.passed += 1; continue; }
      if (test.status === 'flaky') { summary.flaky += 1; continue; }
      summary.failed += 1;

      const file = path.resolve(root, 'tests', spec.file);
      if (!sources.has(file)) sources.set(file, existsSync(file) ? readFileSync(file, 'utf8') : '');
      failures.push({
        tcId: spec.title.split(' ')[0] ?? spec.title,
        title: spec.title,
        project: test.projectName,
        file: path.relative(root, file),
        tags: spec.tags ?? [],
        status: last.status,
        message: stripAnsi(last.error?.message ?? last.status),
        location: last.error?.location ? `${path.relative(root, last.error.location.file)}:${last.error.location.line}` : undefined,
        http: readAttachment<HttpRecord[]>(last, 'http-history.json') ?? [],
        polls: readAttachment<PollRecord[]>(last, 'poll-history.json') ?? [],
        causes: readAttachment<CauseRecord[]>(last, 'cause-log.json') ?? [],
        flakyEvents: readAttachment<FailedTest['flakyEvents']>(last, 'flaky-events.json') ?? [],
        source: sources.get(file) ?? '',
        screenshots: last.attachments.filter((a) => a.contentType === 'image/png' && a.path).map((a) => a.path!),
      });
    }
  }
  return { failures, summary };
}
