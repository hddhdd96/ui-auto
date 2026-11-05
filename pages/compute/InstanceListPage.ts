import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from '../BasePage';

/** Locator + actions only. Scenario assertions live in TC / suite tests. */
export class InstanceListPage extends BasePage {
  private readonly heading = this.page.getByRole('heading', { name: 'Instances', exact: true });

  /** Primary + fallback locators for the create CTA (off-screen until scrolled). */
  private readonly openCreatePrimary = this.page.getByRole('button', {
    name: 'Create instance',
    exact: true,
  });
  private readonly openCreateFallback = this.page.locator('#open-create');

  constructor(page: Page) {
    super(page);
  }

  async open(options?: { overlays?: boolean }): Promise<void> {
    const query = options?.overlays ? '?overlays=1' : '';
    await this.gotoPath(`/instances${query}`);
    await expect(this.heading).toBeVisible();
  }

  instanceRow(name: string): Locator {
    return this.page.locator('[data-testid="instance-row"]').filter({
      has: this.page.getByTestId('instance-name-cell').filter({ hasText: new RegExp(`^${escapeRegExp(name)}$`) }),
    });
  }

  /**
   * Create 버튼 클릭. healing은 뷰포트/오버레이/locator만 다루고,
   * click timeout은 호출자가 넘긴 고정값을 그대로 사용한다.
   */
  async openCreateDialog(timeoutMs = 5_000): Promise<void> {
    const target = await this.healer.prepareClick(
      [this.openCreatePrimary, this.openCreateFallback],
      ['role=button[name="Create instance"]', '#open-create'],
      timeoutMs,
    );
    await target.click({ timeout: timeoutMs });
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
