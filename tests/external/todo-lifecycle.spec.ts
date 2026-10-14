import { test, expect } from '@playwright/test';

/**
 * Public Demo — https://demo.playwright.dev/todomvc
 * 회사 UI 없이 Create → Verify → Delete 패턴을 실행 가능하게 보여준다.
 * 업무 코드와 분리된 demo 전용 스펙이다.
 */
test.describe('Public demo: TodoMVC lifecycle', () => {
  test('add → verify → complete → clear', async ({ page }) => {
    await page.goto('/todomvc/');
    const input = page.getByPlaceholder('What needs to be done?');
    const item = 'qa-test-instance-task';

    await input.fill(item);
    await input.press('Enter');
    await expect(page.getByTestId('todo-title')).toHaveText(item);

    await page.getByTestId('todo-item').getByRole('checkbox').check();
    await expect(page.getByTestId('todo-item')).toHaveClass(/completed/);

    await page.getByRole('button', { name: 'Clear completed' }).click();
    await expect(page.getByTestId('todo-item')).toHaveCount(0);
  });
});
