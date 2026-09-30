import type { Page, TestInfo } from '@playwright/test';

/** 원본 captureStep / takeScreenshot 패턴: 검증 직후 증적 첨부 */
export class EvidenceRecorder {
  constructor(
    private readonly page: Page,
    private readonly testInfo: TestInfo,
  ) {}

  async capture(stepName: string): Promise<void> {
    const buffer = await this.page.screenshot({ fullPage: true });
    await this.testInfo.attach(stepName, {
      body: buffer,
      contentType: 'image/png',
    });
  }
}
