import { expect } from '@playwright/test';
import type { InstanceCreatePage } from '../../pages/compute/InstanceCreatePage';
import type { InstanceListPage } from '../../pages/compute/InstanceListPage';
import type { LoginPage } from '../../pages/auth/LoginPage';
import { loginAsDemo } from './auth';

/** Fixed action budget used by page actions. Healing must not inflate this. */
export const ACTION_TIMEOUT_MS = 5_000;

export async function openCreateForm(
  loginPage: LoginPage,
  instanceListPage: InstanceListPage,
  options?: { overlays?: boolean },
): Promise<void> {
  await loginAsDemo(loginPage);
  if (options?.overlays) {
    await instanceListPage.open({ overlays: true });
  }
  await instanceListPage.openCreateDialog(ACTION_TIMEOUT_MS);
}

export async function createInstanceAndAssertActive(args: {
  loginPage: LoginPage;
  instanceListPage: InstanceListPage;
  instanceCreatePage: InstanceCreatePage;
  name: string;
  flavor: string;
  overlays?: boolean;
}): Promise<void> {
  await openCreateForm(args.loginPage, args.instanceListPage, { overlays: args.overlays });
  await args.instanceCreatePage.fillAndSubmit(
    { name: args.name, flavor: args.flavor },
    ACTION_TIMEOUT_MS,
  );

  const row = args.instanceListPage.instanceRow(args.name);
  await expect(row).toHaveCount(1);
  // 정규식 앵커로 완전 일치. 'INACTIVE' 부분 문자열 통과를 허용하지 않는다.
  await expect(row.getByTestId('instance-status')).toHaveText(/^ACTIVE$/);
  await expect(row.getByTestId('instance-flavor')).toHaveText(new RegExp(`^${escapeRegExp(args.flavor)}$`));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
