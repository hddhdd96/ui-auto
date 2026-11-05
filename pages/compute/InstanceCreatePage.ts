import type { Page } from '@playwright/test';
import { BasePage } from '../BasePage';

export class InstanceCreatePage extends BasePage {
  private readonly dialog = this.page.getByRole('dialog', { name: 'Create instance', exact: true });
  private readonly nameInput = this.dialog.getByTestId('instance-name');
  private readonly flavorSelect = this.dialog.getByTestId('instance-flavor');
  private readonly submit = this.dialog.getByRole('button', { name: 'Create', exact: true });

  constructor(page: Page) {
    super(page);
  }

  async fillAndSubmit(input: { name: string; flavor: string }, timeoutMs = 5_000): Promise<void> {
    await this.dialog.waitFor({ state: 'visible', timeout: timeoutMs });
    await this.nameInput.fill(input.name);
    await this.flavorSelect.selectOption(input.flavor);
    await this.submit.click({ timeout: timeoutMs });
  }
}
