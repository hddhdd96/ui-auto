import type { Locator } from '@playwright/test';
import { ResourceListPage } from './ResourceListPage';

export interface InstanceForm {
  name: string;
  /** 사양 ID. 예: small */
  flavorId: string;
  /** 체크할 보안 그룹 이름 */
  securityGroups?: string[];
}

/** 인스턴스 화면 */
export class InstancesPage extends ResourceListPage {
  readonly title = '인스턴스';
  protected readonly tableName = '인스턴스 목록';
  protected readonly formName = '인스턴스 생성';

  async create(input: InstanceForm): Promise<void> {
    await this.form.getByLabel('이름').fill(input.name);
    await this.form.getByLabel('사양').selectOption(input.flavorId);
    for (const group of input.securityGroups ?? []) {
      await this.form.getByLabel(group, { exact: true }).check();
    }
    await this.form.getByRole('button', { name: '인스턴스 생성' }).click();
  }

  flavor(name: string): Locator {
    return this.cell(name, 2);
  }

  attachedVolumes(name: string): Locator {
    return this.cell(name, 4);
  }

  async resize(name: string, flavorId: string): Promise<void> {
    await this.rowButton(name, '사양 변경').click();
    await this.dialog.getByLabel('새 사양').selectOption(flavorId);
    await this.confirmDialog('변경');
  }
}
