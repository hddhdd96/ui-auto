import type { BrowserContext, Page } from '@playwright/test';

/** 브라우저 쿠키에 들어 있는 콘솔 로그인 토큰 */
export async function readCookieToken(context: BrowserContext): Promise<string> {
  const token = (await context.cookies()).find((c) => c.name === 'portal_token')?.value;
  if (!token) throw new Error('브라우저 쿠키에 로그인 토큰이 없습니다.');
  return token;
}

/** 지정한 토큰을 Authorization 헤더에 넣어 API를 조회한다. 콘솔 세션으로 API 상태를 확인할 때 쓴다. */
export async function getWithToken<T>(page: Page, path: string, token: string): Promise<{ status: number; body: T }> {
  const response = await page.request.get(`/api${path}`, { headers: { authorization: `Bearer ${token}` } });
  return { status: response.status(), body: (await response.json().catch(() => null)) as T };
}
