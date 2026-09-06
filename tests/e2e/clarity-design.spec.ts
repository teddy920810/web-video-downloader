import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('streamnest-consent-v1', 'necessary'));
  await page.route('**/api/auth/get-session', route => route.fulfill({ json: { user: { id: 'visual-test', name: 'Test account', email: 'visual@example.test' }, session: { id: 'test' } } }));
  await page.route('**/api/account/overview', route => route.fulfill({ json: {
    account: { userId: 'visual-test', name: 'Test account', email: 'visual@example.test', image: null, planId: 'free', status: 'active', freeCredits: 1, paidCredits: 0 },
    preferences: { nickname: '', marketingOptIn: false }, reservedCredits: 0, usage: [], ledger: [], redemptions: [], canGrantTestCredits: false,
  } }));
});

test('light account has a flat summary and distinct selected, hover and focus states', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto('/account/credits');
  await expect(page.locator('.account-metrics')).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('.account-metrics .account-panel').first()).toHaveCSS('border-radius', '0px');
  const current = page.locator('.account-nav [aria-current="page"]');
  await expect(current).toHaveCount(1);
  const other = page.locator('.account-nav a[href="/account/security"]');
  await other.hover();
  expect(await other.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(await current.evaluate(el => getComputedStyle(el).backgroundColor));
  await other.focus();
  await expect(other).toHaveCSS('outline-style', 'solid');
  const heading = await page.locator('.account-hero').boundingBox();
  const content = await page.locator('.account-content').boundingBox();
  expect(Math.abs(heading!.x - content!.x)).toBeLessThan(2);
  await page.locator('.account-hero h1').click();
  await page.screenshot({ path: 'output/design/account-clarity.png' });
});

test('mobile account exposes every section without a horizontal navigation strip', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/account/credits');
  const toggle = page.getByRole('button', { name: 'Your account', exact: true });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.getByRole('navigation', { name: 'Account navigation' }).getByRole('link', { name: 'Help & Support' })).toBeVisible();
  expect(await page.locator('.account-nav nav').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await toggle.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.header-account small')).toBeVisible();
});

test('tools and pricing share the light palette, readable inputs and stable auth column', async ({ page }) => {
  await page.goto('/svg-to-image');
  await expect(page.locator('.local-media-tool')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('textarea')).toHaveCSS('color', 'rgb(28, 28, 30)');
  const before = await page.locator('.header-auth').boundingBox();
  await page.unroute('**/api/auth/get-session');
  await page.route('**/api/auth/get-session', route => route.fulfill({ json: null }));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in with Google', exact: true })).toBeVisible();
  expect((await page.locator('.header-auth').boundingBox())!.width).toBe(before!.width);
  await page.goto('/pricing');
  await expect(page.locator('.pricing-grid article').first()).toHaveCSS('color', 'rgb(10, 10, 10)');
});

test('account remains accessible across breakpoints and with larger text', async ({ page }) => {
  await page.goto('/account/credits');
  await expect(page.locator('.account-metrics')).toBeVisible();
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1024 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `viewport ${width}`).toBe(true);
  }
  const result = await new AxeBuilder({ page }).exclude('astro-dev-toolbar').analyze();
  expect(result.violations.filter(item => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([]);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.header-account')).toHaveCSS('transition-duration', '0s');
});
