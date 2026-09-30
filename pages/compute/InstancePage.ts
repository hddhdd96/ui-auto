import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from '../BasePage';

/** Compute Instance. 원본 Nova create + ACTIVE 대기 흐름을 일반화 */
export class InstancePage extends BasePage {
  private readonly computeNav = this.page.getByRole('link', { name: 'Compute', exact: true });
  private readonly instancesHeading = this.page.getByRole('heading', { name: /Instances/i });
  private readonly createButton = this.page.getByRole('button', { name: /Create instance/i });

  constructor(page: Page) {
    super(page);
  }

  async openInstances(): Promise<void> {
    await this.computeNav.click();
    await this.waitVisible(this.instancesHeading);
  }

  instanceRow(name: string): Locator {
    return this.page.getByRole('row').filter({ hasText: name });
  }

  async waitUntilActive(name: string, timeout = 10 * 60_000): Promise<void> {
    await expect(this.instanceRow(name).getByText(/Active|ACTIVE/i).first()).toBeVisible({
      timeout,
    });
  }
}
