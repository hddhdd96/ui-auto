import { expect, type Page } from '@playwright/test';
import { BasePage } from '../BasePage';

/** 로그인 화면. 원본 support/auth의 폼 입력·대시보드 진입을 일반화 */
export class LoginPage extends BasePage {
  private readonly username = this.page.getByLabel(/username|사용자/i).or(
    this.page.locator('input[name="username"]'),
  );
  private readonly password = this.page.getByLabel(/password|비밀번호/i).or(
    this.page.locator('input[name="password"]'),
  );
  private readonly submit = this.page.getByRole('button', { name: /log\s*in|로그인|sign\s*in/i });

  constructor(page: Page) {
    super(page);
  }

  async login(user: string, pass: string): Promise<void> {
    await this.gotoPath('/login');
    await this.username.first().fill(user);
    await this.password.first().fill(pass);
    await this.submit.first().click();
    await expect(this.page).not.toHaveURL(/login/i, { timeout: 60_000 });
  }
}
