import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FullConfig, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';

export function classifyResult(status: TestResult['status']): 'PASS' | 'FAIL' | 'BLOCK' {
  if (status === 'passed') return 'PASS';
  if (status === 'skipped' || status === 'interrupted') return 'BLOCK';
  return 'FAIL';
}

export function summarizeFailure(message: string): string {
  if (/strict mode violation/i.test(message)) return '대상 요소가 여러 개입니다. Locator 범위를 확인하세요.';
  if (/toHaveText|toMatchObject|toBe\(/.test(message)) return '기대값과 실제값이 다릅니다. 원본 오류의 비교 결과를 확인하세요.';
  if (/timeout|timed out/i.test(message)) return '제한 시간 안에 조건을 충족하지 못했습니다. Trace에서 마지막 상태를 확인하세요.';
  return '원본 오류와 첨부 증적을 확인하세요.';
}

type Row = { tcId: string; title: string; result: 'PASS' | 'FAIL' | 'BLOCK'; summary: string; errors: unknown[]; attachments: string[] };

export default class FailureSummaryReporter implements Reporter {
  private readonly rows = new Map<string, Row>();
  onBegin(_config: FullConfig, suite: Suite): void {
    for (const test of suite.allTests()) {
      this.rows.set(test.id, {
        tcId: test.annotations.find(annotation => annotation.type === 'tc-id')?.description ?? test.id,
        title: test.titlePath().join(' > '), result: 'BLOCK', summary: '아직 실행되지 않았습니다.', errors: [], attachments: [],
      });
    }
  }
  onTestEnd(test: TestCase, result: TestResult): void {
    const row = this.rows.get(test.id)!;
    row.result = classifyResult(result.status);
    row.summary = row.result === 'PASS' ? '' : summarizeFailure(result.errors.map(error => error.message ?? '').join('\n'));
    row.errors = result.errors;
    row.attachments = result.attachments.map(attachment => attachment.path ?? attachment.name);
  }
  onEnd(): void {
    const directory = path.resolve('report');
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, 'tc-summary.json'), JSON.stringify([...this.rows.values()], null, 2));
  }
}
