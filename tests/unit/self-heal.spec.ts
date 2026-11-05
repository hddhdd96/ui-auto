import { test, expect } from '@playwright/test';
import { SelfHealer } from '../../healing/selfHeal';
import { OVERLAY_ALLOWLIST } from '../../healing/overlayAllowlist';

test.describe('self-heal policy invariants', () => {
  test('allowlist only covers disruptive overlay roles', () => {
    const roles = OVERLAY_ALLOWLIST.map((rule) => rule.role).sort();
    expect(roles).toEqual(['cloud-view-banner', 'product-tour']);
  });

  test('prepareClick records scroll and overlay dismiss without changing caller timeout', async ({
    page,
  }) => {
    await page.setContent(`
      <style>button { margin-top: 120vh; }</style>
      <aside data-healing-role="cloud-view-banner">
        <button data-dismiss="cloud-view">Got it</button>
      </aside>
      <button id="cta">Create instance</button>
    `);

    const healer = new SelfHealer(page);
    const timeoutMs = 3_000;
    const target = await healer.prepareClick(
      [page.getByRole('button', { name: 'Create instance', exact: true })],
      ['role=button[name="Create instance"]'],
      timeoutMs,
    );
    await target.click({ timeout: timeoutMs });

    expect(healer.report.actions.map((item) => item.kind)).toEqual([
      'dismiss-overlay',
      'scroll-into-view',
    ]);
  });

  test('locator fallback switches candidate without extending timeout budget', async ({ page }) => {
    await page.setContent(`<button id="fallback-cta">Create instance</button>`);
    const healer = new SelfHealer(page);
    const timeoutMs = 1_500;
    const resolved = await healer.resolveLocator(
      [page.locator('#missing-primary'), page.locator('#fallback-cta')],
      ['#missing-primary', '#fallback-cta'],
      timeoutMs,
    );
    await expect(resolved).toHaveText(/^Create instance$/);
    expect(healer.report.actions).toEqual([
      { kind: 'locator-fallback', from: '#missing-primary', to: '#fallback-cta' },
    ]);
  });
});
