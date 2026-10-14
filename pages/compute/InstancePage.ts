import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from '../BasePage';

/** Reference contract: the local demo implements volumes, not compute. */
export class InstancePage extends BasePage {
  private readonly heading = this.page.getByRole('heading', { name: 'Instances', exact: true });
  private readonly rows = new Map<string, Locator>();
  constructor(page: Page) { super(page); }

  async openInstances(): Promise<void> {
    await this.gotoPath('/instances');
    await expect(this.heading).toBeVisible();
  }

  instanceRow(name: string): Locator {
    let row = this.rows.get(name);
    if (!row) {
      row = this.page.getByRole('row').filter({ has: this.page.getByRole('cell', { name, exact: true }) });
      this.rows.set(name, row);
    }
    return row;
  }

  async waitUntilActive(name: string): Promise<void> {
    await expect(this.instanceRow(name).getByTestId('instance-status')).toHaveText('ACTIVE');
  }
}
