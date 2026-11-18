import type { Page, Response } from '@playwright/test';
import type { Evidence } from '../api/evidence';

/** 브라우저(콘솔)가 받은 API 응답 한 건 */
export interface ObservedResponse {
  method: string;
  /** /api 뒤의 경로. 예: /volume-groups/vg-0003 */
  path: string;
  status: number;
  retry: boolean;
  at: number;
}

const apiPath = (response: Response) => new URL(response.url()).pathname.replace(/^\/api/, '');

/**
 * 콘솔이 받은 모든 API 응답을 기록한다. 실패 증적(HTTP 응답 이력)에 브라우저 요청까지 남기기 위해 쓴다.
 * naive와 stable 모두 같은 기록을 남기므로, 두 테스트의 차이는 '응답을 어떻게 해석했는가'에만 있다.
 */
export function recordBrowserResponses(page: Page, evidence: Evidence): ObservedResponse[] {
  const observed: ObservedResponse[] = [];
  page.on('response', (response) => {
    if (!new URL(response.url()).pathname.startsWith('/api/')) return;
    const entry: ObservedResponse = {
      method: response.request().method(),
      path: apiPath(response),
      status: response.status(),
      retry: response.request().headers()['x-portal-retry'] !== undefined,
      at: Date.now(),
    };
    observed.push(entry);
    evidence.recordHttp({
      method: entry.method, path: entry.path, status: entry.status, elapsedMs: 0, source: 'browser', retry: entry.retry,
    });
  });
  return observed;
}

/**
 * [stable] 이 단계에서 보낸 요청의 응답만 기다린다. 메서드와 URL(리소스 ID 포함)이 같아야 짝으로 본다.
 * 앞 단계에서 늦게 도착한 다른 리소스의 응답은 무시된다.
 */
export function waitForOwnResponse(page: Page, method: string, path: string): Promise<Response> {
  return page.waitForResponse((r) => r.request().method() === method && apiPath(r) === path);
}

/**
 * [naive] 메서드만 보고 '다음에 오는 응답'을 기다린다. 어떤 리소스의 응답인지 구분하지 않는다.
 */
export function waitForNextResponse(page: Page, method: string): Promise<Response> {
  return page.waitForResponse((r) => r.request().method() === method && apiPath(r) !== '');
}
