import type { Locator, Page } from '@playwright/test';

/** 로그인 화면 */
export class LoginPage {
  readonly username: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly error: Locator;

  constructor(private readonly page: Page) {
    this.username = page.getByLabel('아이디');
    this.password = page.getByLabel('비밀번호');
    this.submit = page.getByRole('button', { name: '로그인' });
    this.error = page.getByRole('alert');
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
    await this.submit.waitFor();
  }

  async login(username: string, password: string): Promise<void> {
    await this.username.fill(username);
    await this.password.fill(password);
    await this.submit.click();
  }
}
