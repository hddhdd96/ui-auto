import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from '../BasePage';

export class VolumePage extends BasePage {
  private readonly volumesHeading = this.page.getByRole('heading', { name: 'Volumes', exact: true });
  private readonly createButton = this.page.getByRole('button', { name: 'Create volume', exact: true });
  private readonly createDialog = this.page.getByRole('dialog', { name: 'Create volume', exact: true });
  private readonly nameInput = this.createDialog.getByLabel('Volume name', { exact: true });
  private readonly sizeInput = this.createDialog.getByLabel('Size (GiB)', { exact: true });
  private readonly submitCreate = this.createDialog.getByRole('button', { name: 'Create', exact: true });
  private readonly deleteDialog = this.page.getByRole('dialog', { name: 'Delete volume', exact: true });
  private readonly confirmDelete = this.deleteDialog.getByRole('button', { name: 'Delete', exact: true });
  private readonly rows = new Map<string, Locator>();

  constructor(page: Page) { super(page); }

  async openVolumes(): Promise<void> {
    await this.gotoPath('/volumes');
    await expect(this.volumesHeading).toBeVisible();
  }

  volumeRow(name: string): Locator {
    let row = this.rows.get(name);
    if (!row) {
      row = this.page.getByRole('row').filter({ has: this.page.getByRole('cell', { name, exact: true }) });
      this.rows.set(name, row);
    }
    return row;
  }

  async createVolume(name: string, sizeGiB: number): Promise<void> {
    await this.createButton.click();
    await expect(this.createDialog).toBeVisible();
    await this.nameInput.fill(name);
    await this.sizeInput.fill(String(sizeGiB));
    await expect(this.nameInput).toHaveValue(name);
    await expect(this.sizeInput).toHaveValue(String(sizeGiB));
    await this.submitCreate.click();
    await expect(this.createDialog).not.toBeVisible();
    await expect(this.volumeRow(name)).toHaveCount(1);
  }

  async waitUntilActive(name: string): Promise<void> {
    await expect(this.volumeRow(name).getByTestId('volume-status')).toHaveText('ACTIVE');
  }

  async expectSize(name: string, sizeGiB: number): Promise<void> {
    await expect(this.volumeRow(name).getByTestId('volume-size')).toHaveText(`${sizeGiB} GiB`);
  }

  async deleteVolume(name: string): Promise<void> {
    await this.volumeRow(name).getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(this.deleteDialog).toBeVisible();
    await this.confirmDelete.click();
    await expect(this.deleteDialog).not.toBeVisible();
    await this.expectDeleted(name);
  }

  async expectDeleted(name: string): Promise<void> {
    await expect(this.volumeRow(name)).toHaveCount(0);
  }
}
