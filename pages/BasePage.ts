import { expect, type Locator, type Page } from '@playwright/test';

/** 공통 대기·네비게이션. 원본 utils의 list-ready / capture 패턴을 단순화 */
export class BasePage {
  constructor(protected readonly page: Page) {}

  protected async waitVisible(locator: Locator, timeout = 20_000): Promise<void> {
    await expect(locator).toBeVisible({ timeout });
  }

  async gotoPath(path: string): Promise<void> {
    await this.page.goto(path, { waitUntil: 'domcontentloaded' });
  }
}
