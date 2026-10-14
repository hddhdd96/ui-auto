import { expect, type Page } from '@playwright/test';
import { BasePage } from '../BasePage';

export class LoginPage extends BasePage {
  private readonly username = this.page.getByLabel('Username', { exact: true });
  private readonly password = this.page.getByLabel('Password', { exact: true });
  private readonly submit = this.page.getByRole('button', { name: 'Log in', exact: true });
  private readonly signedInUser = this.page.getByRole('status', { name: 'Signed in user', exact: true });
  constructor(page: Page) { super(page); }

  async login(user: string, password: string): Promise<void> {
    await this.gotoPath('/login');
    await this.username.fill(user);
    await this.password.fill(password);
    await this.submit.click();
    await expect(this.page).toHaveURL(/\/volumes$/);
    await expect(this.signedInUser).toHaveText(user);
  }
}
