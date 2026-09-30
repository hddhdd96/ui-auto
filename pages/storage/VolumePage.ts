import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from '../BasePage';

/**
 * Storage Volume Page Object.
 * 원본 CinderPage 패턴: locator 캡슐화 + create / status wait / delete.
 * 메뉴·문구는 일반 영문 라벨로 대체.
 */
export class VolumePage extends BasePage {
  private readonly storageNav = this.page.getByRole('link', { name: 'Storage', exact: true });
  private readonly volumesHeading = this.page.getByRole('heading', { name: /Volumes/i });
  private readonly createButton = this.page.getByRole('button', { name: /Create volume/i });
  private readonly createDialog = this.page.getByRole('dialog').filter({ hasText: /Create volume/i });
  private readonly nameInput = this.page.getByLabel(/Volume name/i);
  private readonly sizeInput = this.page.getByLabel(/Size/i);
  private readonly submitCreate = this.page.getByRole('button', { name: /^Create$/i });

  constructor(page: Page) {
    super(page);
  }

  async openVolumes(): Promise<void> {
    await this.storageNav.click();
    await this.waitVisible(this.volumesHeading);
  }

  volumeRow(name: string): Locator {
    return this.page.getByRole('row').filter({ hasText: name });
  }

  async createVolume(name: string, sizeGiB: number): Promise<void> {
    await this.createButton.click();
    await this.waitVisible(this.createDialog.or(this.nameInput.first()));
    await this.nameInput.first().fill(name);
    await this.sizeInput.first().fill(String(sizeGiB));
    await this.submitCreate.first().click();
    await expect(this.volumeRow(name)).toBeVisible({ timeout: 60_000 });
  }

  /** 상태 셀이 Active가 될 때까지 expect 폴링 (고정 sleep 대신) */
  async waitUntilActive(name: string, timeout = 10 * 60_000): Promise<void> {
    const status = this.volumeRow(name).getByText(/Active|ACTIVE|사용\s*중/i).first();
    await expect(status).toBeVisible({ timeout });
  }

  async openDetails(name: string): Promise<void> {
    await this.volumeRow(name).getByRole('link', { name }).click();
  }

  async deleteVolume(name: string): Promise<void> {
    const row = this.volumeRow(name);
    await row.getByRole('button', { name: /More|Actions|더보기/i }).click();
    await this.page.getByRole('menuitem', { name: /Delete/i }).click();
    const confirm = this.page.getByRole('dialog').filter({ hasText: /Delete/i });
    await confirm.getByRole('button', { name: /Delete|Confirm|삭제/i }).click();
    await expect(row).toHaveCount(0, { timeout: 120_000 });
  }
}
