import { writeFileSync } from 'node:fs';
import type { Page, Request, TestInfo } from '@playwright/test';

type NetworkEntry = { method: string; path: string; status?: number; body?: string; failure?: string; durationMs?: number };

const SLOW_MS = 3_000;

/**
 * 실패 증적용 네트워크 기록. 4xx/5xx 응답(본문 앞부분), 전송 실패, 3초 이상 걸린 요청, 끝나지 않은 요청을 남긴다.
 * 모달 등으로 화면에 오류 문구가 보이지 않아도 원인 판단 근거를 확보하기 위한 것이며, 판정에는 관여하지 않는다.
 */
export class NetworkLog {
  private readonly started = new Map<Request, number>();
  private readonly entries: NetworkEntry[] = [];
  private readonly reads: Promise<void>[] = [];

  constructor(page: Page) {
    page.on('request', request => this.started.set(request, Date.now()));
    page.on('requestfinished', request => {
      const startedAt = this.started.get(request);
      this.started.delete(request);
      const durationMs = startedAt === undefined ? 0 : Date.now() - startedAt;
      if (durationMs >= SLOW_MS) this.entries.push({ method: request.method(), path: pathOf(request.url()), durationMs });
    });
    page.on('requestfailed', request => {
      this.started.delete(request);
      this.entries.push({ method: request.method(), path: pathOf(request.url()), failure: request.failure()?.errorText });
    });
    page.on('response', response => {
      if (response.status() < 400 || pathOf(response.url()) === '/favicon.ico') return;
      const entry: NetworkEntry = { method: response.request().method(), path: pathOf(response.url()), status: response.status() };
      this.entries.push(entry);
      this.reads.push(response.text().then(body => { entry.body = body.slice(0, 300); }, () => undefined));
    });
  }

  /** 실패한 테스트에서만 파일로 첨부한다. */
  async attachIfFailed(testInfo: TestInfo): Promise<void> {
    if (testInfo.status === testInfo.expectedStatus) return;
    await Promise.all(this.reads);
    const now = Date.now();
    const pending = [...this.started].map(([request, startedAt]) => ({
      method: request.method(), path: pathOf(request.url()), pendingMs: now - startedAt,
    }));
    const file = testInfo.outputPath('network-log.json');
    writeFileSync(file, JSON.stringify({ problems: this.entries, pending }, null, 2));
    await testInfo.attach('network-log', { path: file, contentType: 'application/json' });
  }
}

function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}
