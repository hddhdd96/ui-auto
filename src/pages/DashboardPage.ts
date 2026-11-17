import type { Locator, Page } from '@playwright/test';

export type UsageItem =
  | '인스턴스 수' | 'vCPU' | '메모리(GB)' | '볼륨 수' | '볼륨 용량(GB)' | '볼륨 그룹 수' | '네트워크 수' | '보안 그룹 수';

/** 대시보드 화면: 프로젝트 사용량·쿼터 표와 관리자 전용 쿼터 변경 폼 */
export class DashboardPage {
  readonly title = '대시보드';
  readonly heading: Locator;
  readonly table: Locator;
  readonly quotaForm: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: '대시보드', exact: true, level: 1 });
    this.table = page.getByRole('table', { name: '프로젝트 사용량' });
    this.quotaForm = page.getByRole('form', { name: '쿼터 변경' });
  }

  private row(item: UsageItem): Locator {
    return this.table.getByRole('row').filter({ has: this.page.getByRole('cell', { name: item, exact: true }) });
  }

  /** 항목의 사용량 칸 */
  used(item: UsageItem): Locator {
    return this.row(item).getByRole('cell').nth(1);
  }

  /** 항목의 쿼터 칸 */
  quota(item: UsageItem): Locator {
    return this.row(item).getByRole('cell').nth(2);
  }

  async changeQuota(item: UsageItem, value: number): Promise<void> {
    await this.quotaForm.getByLabel(item, { exact: true }).fill(String(value));
    await this.quotaForm.getByRole('button', { name: '쿼터 저장' }).click();
  }
}
