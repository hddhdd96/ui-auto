import type { Page } from '@playwright/test';
import { SelfHealer } from '../healing/selfHeal';

/** 공통 네비게이션 + self-healer 주입. assertion/timeout 정책은 테스트·config에만 둔다. */
export class BasePage {
  protected readonly healer: SelfHealer;

  constructor(protected readonly page: Page) {
    this.healer = new SelfHealer(page);
  }

  async gotoPath(path: string): Promise<void> {
    await this.page.goto(path, { waitUntil: 'domcontentloaded' });
  }

  healingReport() {
    return this.healer.report;
  }
}
