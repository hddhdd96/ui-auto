import type { Locator, Page } from '@playwright/test';

/**
 * 목록 표와 생성 폼, 확인 대화상자가 있는 화면의 공통 부분.
 * Page Object는 locator와 action만 담당하고, 기대값 확인(assertion)은 테스트가 한다.
 */
export abstract class ResourceListPage {
  /** 화면 제목(h1)이자 메뉴 이름 */
  abstract readonly title: string;
  /** 목록 표의 caption */
  protected abstract readonly tableName: string;
  /** 생성 폼의 이름 */
  protected abstract readonly formName: string;

  readonly dialog: Locator;
  /** 대화상자 안에 표시되는 오류 */
  readonly dialogError: Locator;

  constructor(protected readonly page: Page) {
    this.dialog = page.getByRole('dialog');
    this.dialogError = this.dialog.getByRole('alert');
  }

  get heading(): Locator {
    return this.page.getByRole('heading', { name: this.title, exact: true, level: 1 });
  }

  get table(): Locator {
    return this.page.getByRole('table', { name: this.tableName });
  }

  get form(): Locator {
    return this.page.getByRole('form', { name: this.formName });
  }

  /** 이름 칸이 정확히 일치하는 행 */
  row(name: string): Locator {
    return this.table.getByRole('row').filter({ has: this.page.getByRole('cell', { name, exact: true }) });
  }

  /** 행에서 열 머리글에 해당하는 칸. 열 순서는 화면마다 columns에 정의한다. */
  protected cell(name: string, column: number): Locator {
    return this.row(name).getByRole('cell').nth(column);
  }

  /** 상태 열은 모든 목록에서 두 번째 칸이다. */
  status(name: string): Locator {
    return this.cell(name, 1);
  }

  protected rowButton(name: string, action: string): Locator {
    return this.page.getByRole('button', { name: `${name} ${action}`, exact: true });
  }

  /** 대화상자의 확인 버튼을 누른다. 버튼 이름은 동작마다 다르다(삭제, 변경, 연결, 추가). */
  protected async confirmDialog(buttonName: string): Promise<void> {
    await this.dialog.getByRole('button', { name: buttonName, exact: true }).click();
  }

  async cancelDialog(): Promise<void> {
    await this.dialog.getByRole('button', { name: '취소' }).click();
  }

  /** 삭제 버튼을 누르고 대화상자에서 확인한다. */
  async delete(name: string): Promise<void> {
    await this.rowButton(name, '삭제').click();
    await this.confirmDialog('삭제');
  }
}
