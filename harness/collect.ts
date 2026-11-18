import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { stripAnsi } from './triage/report';

/** 결과서에 들어갈 테스트 한 건 */
export interface TestRow {
  tcId: string;
  title: string;
  /** Playwright 프로젝트 이름(스위트). 예: api, ui, negative */
  suite: string;
  file: string;
  status: 'passed' | 'failed' | 'flaky' | 'notrun';
  durationMs: number;
  /** 실패했을 때 오류 메시지 첫 줄 */
  error: string | null;
  /** 실행 디렉터리 기준 상대 경로 */
  screenshots: string[];
}

interface JsonAttachment { name: string; contentType: string; path?: string }
interface JsonResult { status: string; duration: number; error?: { message?: string }; attachments: JsonAttachment[] }
interface JsonTest { projectName: string; status: string; results: JsonResult[] }
interface JsonSpec { title: string; file: string; tests: JsonTest[] }
interface JsonSuite { specs?: JsonSpec[]; suites?: JsonSuite[] }

function collectSpecs(suites: JsonSuite[], into: JsonSpec[] = []): JsonSpec[] {
  for (const suite of suites) {
    into.push(...(suite.specs ?? []));
    collectSpecs(suite.suites ?? [], into);
  }
  return into;
}

/**
 * Playwright JSON 결과에서 모든 테스트를 읽고, 스크린샷 증적을 실행 디렉터리의 evidence/로 복사한다.
 * test-results/는 다음 실행 때 지워지므로, 결과서가 참조하는 증적은 실행 디렉터리에 따로 보관한다.
 */
export function collectTests(jsonFile: string, runDir: string): TestRow[] {
  const report = JSON.parse(readFileSync(jsonFile, 'utf8')) as { suites: JsonSuite[] };
  const evidenceDir = path.join(runDir, 'evidence');
  mkdirSync(evidenceDir, { recursive: true });
  const rows: TestRow[] = [];

  for (const spec of collectSpecs(report.suites)) {
    for (const test of spec.tests) {
      const tcId = spec.title.split(' ')[0] ?? spec.title;
      const last = test.results.at(-1);
      const status: TestRow['status'] =
        test.status === 'skipped' || !last || last.status === 'skipped' ? 'notrun'
          : test.status === 'expected' ? 'passed'
            : test.status === 'flaky' ? 'flaky' : 'failed';
      const screenshots: string[] = [];
      for (const [index, attachment] of (last?.attachments ?? []).entries()) {
        if (attachment.contentType !== 'image/png' || !attachment.path || !existsSync(attachment.path)) continue;
        const name = `${tcId}-${test.projectName}-${index + 1}.png`;
        copyFileSync(attachment.path, path.join(evidenceDir, name));
        screenshots.push(path.join('evidence', name));
      }
      rows.push({
        tcId,
        title: spec.title.slice(tcId.length).trim(),
        suite: test.projectName,
        file: spec.file,
        status,
        durationMs: test.results.reduce((sum, r) => sum + r.duration, 0),
        error: status === 'failed' ? stripAnsi(last?.error?.message ?? '').split('\n').find((l) => l.trim()) ?? null : null,
        screenshots,
      });
    }
  }
  return rows;
}
