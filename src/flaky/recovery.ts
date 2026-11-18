import { expect } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { isNetworkError } from '../api/client';
import type { Evidence } from '../api/evidence';
import type { ConsolePage } from '../pages/ConsolePage';

interface Screen { readonly title: string; readonly heading: Locator }

/**
 * [stable] 화면을 열고, 네트워크 오류로 화면이 열리지 않으면 원인을 env로 기록한 뒤 다시 연다.
 * 네트워크 오류가 아닌 오류 메시지(제품 오류)는 다시 시도하지 않고 product로 기록한 뒤 바로 실패한다.
 */
export async function openScreenWithRecovery<T extends Screen>(
  console: ConsolePage, screen: T, evidence: Evidence, attempts = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await console.clickMenu(screen.title);
    await expect(screen.heading.or(console.error)).toBeVisible();
    if (await screen.heading.isVisible()) return screen;

    const message = (await console.error.textContent()) ?? '';
    if (!isNetworkError(message)) {
      evidence.recordCause('product', `${screen.title} 화면 오류: ${message}`, false);
      throw new Error(`[product] ${screen.title} 화면을 열 수 없습니다: ${message}`);
    }
    evidence.recordCause('env', `${screen.title} 화면 네트워크 오류(${message}), 다시 엶`, attempt < attempts);
    // 같은 메뉴를 다시 눌러도 주소가 그대로라 화면이 다시 그려지지 않는다. 대시보드를 거쳐 다시 연다.
    await console.clickMenu('대시보드');
    await console.page.getByRole('heading', { name: '대시보드', level: 1 }).waitFor();
  }
  throw new Error(`[env] ${screen.title} 화면이 네트워크 오류로 ${attempts}회 열리지 않았습니다. 제품 응답이 아니라 환경 요인입니다.`);
}
