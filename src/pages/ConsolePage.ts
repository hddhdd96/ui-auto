import type { Locator, Page } from '@playwright/test';
import { DashboardPage } from './DashboardPage';
import { InstancesPage } from './InstancesPage';
import { NetworksPage, SecurityGroupsPage } from './NetworkPages';
import { VolumeGroupsPage, VolumesPage } from './VolumesPage';

interface Screen { readonly title: string; readonly heading: Locator }

/** 콘솔 공통 영역: 상단 바, 주 메뉴, 알림 메시지 */
export class ConsolePage {
  readonly menu: Locator;
  readonly projectSelect: Locator;
  readonly userName: Locator;
  readonly sessionExpiry: Locator;
  readonly extendButton: Locator;
  readonly logoutButton: Locator;
  /** 성공 안내 메시지 */
  readonly message: Locator;
  /** 화면 위쪽에 표시되는 오류 메시지 */
  readonly error: Locator;

  constructor(readonly page: Page) {
    this.menu = page.getByRole('navigation', { name: '주 메뉴' });
    this.projectSelect = page.getByLabel('프로젝트');
    this.userName = page.getByLabel('로그인 사용자');
    this.sessionExpiry = page.getByLabel('세션 만료 시각');
    this.extendButton = page.getByRole('button', { name: '세션 연장' });
    this.logoutButton = page.getByRole('button', { name: '로그아웃' });
    this.message = page.getByRole('main').getByRole('status');
    this.error = page.getByRole('main').getByRole('alert');
  }

  /** 콘솔을 열고 첫 화면(대시보드)이 뜰 때까지 기다린다. */
  async goto(): Promise<DashboardPage> {
    await this.page.goto('/#/dashboard');
    const dashboard = new DashboardPage(this.page);
    await dashboard.heading.waitFor();
    return dashboard;
  }

  /**
   * 메뉴를 눌러 화면을 연다. 메뉴를 누른 직후에는 이전 화면이 잠깐 남아 있으므로,
   * 새 화면의 제목이 나타난 뒤에 조작을 시작한다.
   */
  private async open<T extends Screen>(screen: T): Promise<T> {
    await this.clickMenu(screen.title);
    await screen.heading.waitFor({ timeout: 10_000 });
    return screen;
  }

  /** 메뉴만 누른다. 화면이 열렸는지는 확인하지 않는다(복구 로직에서 직접 확인할 때 쓴다). */
  async clickMenu(title: string): Promise<void> {
    await this.menu.getByRole('link', { name: title, exact: true }).click();
  }

  openDashboard = () => this.open(new DashboardPage(this.page));
  openInstances = () => this.open(new InstancesPage(this.page));
  openVolumes = () => this.open(new VolumesPage(this.page));
  openVolumeGroups = () => this.open(new VolumeGroupsPage(this.page));
  openNetworks = () => this.open(new NetworksPage(this.page));
  openSecurityGroups = () => this.open(new SecurityGroupsPage(this.page));

  async extendSession(): Promise<void> {
    await this.extendButton.click();
  }

  async logout(): Promise<void> {
    await this.logoutButton.click();
  }
}
