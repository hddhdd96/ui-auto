import type { Locator } from '@playwright/test';
import { ResourceListPage } from './ResourceListPage';

/** 네트워크 화면. 생성·삭제 기능은 관리자에게만 보인다. */
export class NetworksPage extends ResourceListPage {
  readonly title = '네트워크';
  protected readonly tableName = '네트워크 목록';
  protected readonly formName = '네트워크 생성';

  /** 일반 사용자에게 보이는 안내 문구 */
  get adminOnlyNotice(): Locator {
    return this.page.getByText('네트워크 생성과 삭제는 관리자만 할 수 있습니다.');
  }

  /** 목록의 네트워크는 상태 열이 없고 두 번째 칸이 IP 대역이다. */
  cidr(name: string): Locator {
    return this.cell(name, 1);
  }

  subnets(name: string): Locator {
    return this.cell(name, 2);
  }

  async create(name: string, cidr: string): Promise<void> {
    await this.form.getByLabel('이름').fill(name);
    await this.form.getByLabel('IP 대역').fill(cidr);
    await this.form.getByRole('button', { name: '네트워크 생성' }).click();
  }

  async addSubnet(networkName: string, subnetName: string, cidr: string): Promise<void> {
    await this.rowButton(networkName, '서브넷 추가').click();
    await this.dialog.getByLabel('서브넷 이름').fill(subnetName);
    await this.dialog.getByLabel('서브넷 IP 대역').fill(cidr);
    await this.confirmDialog('추가');
  }
}

export interface SecurityGroupForm {
  name: string;
  description?: string;
  rule?: { direction: 'ingress' | 'egress'; protocol: 'tcp' | 'udp' | 'icmp'; port?: number; cidr: string };
}

/** 보안 그룹 화면 */
export class SecurityGroupsPage extends ResourceListPage {
  readonly title = '보안 그룹';
  protected readonly tableName = '보안 그룹 목록';
  protected readonly formName = '보안 그룹 생성';

  rules(name: string): Locator {
    return this.cell(name, 2);
  }

  async create(input: SecurityGroupForm): Promise<void> {
    await this.form.getByLabel('이름').fill(input.name);
    await this.form.getByLabel('설명').fill(input.description ?? '');
    if (input.rule) {
      await this.form.getByLabel('방향').selectOption(input.rule.direction);
      await this.form.getByLabel('프로토콜').selectOption(input.rule.protocol);
      await this.form.getByLabel('포트', { exact: true }).fill(input.rule.port === undefined ? '' : String(input.rule.port));
      await this.form.getByLabel('허용 IP 대역').fill(input.rule.cidr);
    }
    await this.form.getByRole('button', { name: '보안 그룹 생성' }).click();
  }
}
