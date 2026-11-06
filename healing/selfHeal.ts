import type { Locator, Page } from '@playwright/test';
import { OVERLAY_ALLOWLIST } from './overlayAllowlist';

export type HealAction =
  | { kind: 'scroll-into-view'; locator: string }
  | { kind: 'locator-fallback'; from: string; to: string }
  | { kind: 'dismiss-overlay'; role: string };

export interface HealReport {
  actions: HealAction[];
}

/**
 * Flaky self-healing helpers.
 *
 * 허용:
 * - scroll into view
 * - locator fallback 체인
 * - allowlist 방해 오버레이 dismiss
 *
 * 금지 (호출부에서 보장):
 * - assertion 완화
 * - retry / timeout 값 증가
 * - soft expect / skip 으로 실패 은닉
 *
 * timeoutMs는 호출자가 넘긴 고정 예산이다. 이 모듈은 예산을 늘리지 않는다.
 */
export class SelfHealer {
  readonly report: HealReport = { actions: [] };

  constructor(private readonly page: Page) {}

  /** allowlist에 있는 방해 오버레이만 닫는다. */
  async dismissAllowlistedOverlays(): Promise<void> {
    for (const rule of OVERLAY_ALLOWLIST) {
      const root = this.page.locator(rule.root);
      if ((await root.count()) === 0) continue;
      if (!(await root.first().isVisible().catch(() => false))) continue;

      const dismiss = root.first().locator(rule.dismiss);
      if ((await dismiss.count()) === 0) continue;
      await dismiss.first().click({ timeout: 2_000 });
      this.report.actions.push({ kind: 'dismiss-overlay', role: rule.role });
    }
  }

  /**
   * 후보 Locator를 순서대로 시도한다.
   * 각 후보에는 동일한 timeoutMs 예산을 쓰며, 예산을 확장하지 않는다.
   */
  async resolveLocator(
    candidates: readonly Locator[],
    labels: readonly string[],
    timeoutMs: number,
  ): Promise<Locator> {
    if (candidates.length === 0) {
      throw new Error('resolveLocator requires at least one candidate');
    }
    if (candidates.length !== labels.length) {
      throw new Error('resolveLocator candidates/labels length mismatch');
    }

    let lastError: unknown;
    for (let index = 0; index < candidates.length; index += 1) {
      const locator = candidates[index];
      try {
        await locator.first().waitFor({ state: 'attached', timeout: timeoutMs });
        if (index > 0) {
          this.report.actions.push({
            kind: 'locator-fallback',
            from: labels[0],
            to: labels[index],
          });
        }
        return locator.first();
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError instanceof Error) throw lastError;
    throw new Error(`No locator candidate matched within ${timeoutMs}ms`);
  }

  /** 클릭 전에 뷰포트로 스크롤한다. timeout은 호출자 고정값. */
  async scrollIntoView(locator: Locator, label: string, timeoutMs: number): Promise<Locator> {
    const target = locator.first();
    await target.waitFor({ state: 'attached', timeout: timeoutMs });
    await target.scrollIntoViewIfNeeded({ timeout: timeoutMs });
    this.report.actions.push({ kind: 'scroll-into-view', locator: label });
    return target;
  }

  /**
   * 클릭 전 healing 파이프라인:
   * 1) allowlist 오버레이 dismiss
   * 2) locator fallback
   * 3) scroll into view
   * 이후 실제 click은 페이지 객체가 수행한다 (assertion/timeout 불변).
   */
  async prepareClick(
    candidates: readonly Locator[],
    labels: readonly string[],
    timeoutMs: number,
  ): Promise<Locator> {
    await this.dismissAllowlistedOverlays();
    const resolved = await this.resolveLocator(candidates, labels, timeoutMs);
    return this.scrollIntoView(resolved, labels[0], timeoutMs);
  }
}
