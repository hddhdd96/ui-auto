import type { Locator } from '@playwright/test';
import { ResourceListPage } from './ResourceListPage';

/** 볼륨 화면 */
export class VolumesPage extends ResourceListPage {
  readonly title = '볼륨';
  protected readonly tableName = '볼륨 목록';
  protected readonly formName = '볼륨 생성';

  async create(name: string, sizeGb: number | string): Promise<void> {
    await this.form.getByLabel('이름').fill(name);
    await this.form.getByLabel('크기(GB)').fill(String(sizeGb));
    await this.form.getByRole('button', { name: '볼륨 생성' }).click();
  }

  attachedInstance(name: string): Locator {
    return this.cell(name, 3);
  }

  volumeGroup(name: string): Locator {
    return this.cell(name, 4);
  }

  async attach(name: string, instanceName: string): Promise<void> {
    await this.rowButton(name, '연결').click();
    await this.dialog.getByLabel('연결할 인스턴스').selectOption({ label: instanceName });
    await this.confirmDialog('연결');
  }

  async detach(name: string): Promise<void> {
    await this.rowButton(name, '분리').click();
  }
}

/** 볼륨 그룹 화면 */
export class VolumeGroupsPage extends ResourceListPage {
  readonly title = '볼륨 그룹';
  protected readonly tableName = '볼륨 그룹 목록';
  protected readonly formName = '볼륨 그룹 생성';

  async create(name: string, volumeNames: string[]): Promise<void> {
    await this.form.getByLabel('이름').fill(name);
    for (const volume of volumeNames) {
      await this.form.getByLabel(volume, { exact: true }).check();
    }
    await this.form.getByRole('button', { name: '볼륨 그룹 생성' }).click();
  }

  volumes(name: string): Locator {
    return this.cell(name, 2);
  }
}
