import { expect, test, type Page } from '@playwright/test';

async function accountFixture(page: Page, administrator = false) {
  const payload = {
    account: { userId: 'account-test', email: 'qa@example.test', name: 'Google name', image: null, planId: 'free', status: 'active', freeCredits: 1, paidCredits: 0 },
    preferences: { nickname: '', marketingOptIn: false }, usage: [], reservedCredits: 0,
    ledger: [{ id: '1', eventType: 'grant', freeDelta: 1, paidDelta: 0, createdAt: '2026-09-01T00:00:00Z' }],
    redemptions: [] as Array<{ id: string; label: string; credits: number; createdAt: string }>, canGrantTestCredits: administrator,
  };
  await page.route('**/api/auth/get-session', (route) => route.fulfill({ json: { user: { id: 'account-test', email: payload.account.email, name: 'Google name' }, session: { id: 'test-session' } } }));
  await page.route('**/api/account/overview', (route) => route.fulfill({ json: payload }));
  await page.route('**/api/account/profile', async (route) => { payload.preferences = route.request().postDataJSON(); await route.fulfill({ json: { saved: true } }); });
  return payload;
}

test('saves nickname and optional marketing preference across reloads without modifying Google identity', async ({ page }) => {
  await accountFixture(page);
  await page.goto('/account/profile');
  await expect(page.getByLabel('Email me product news')).not.toBeChecked();
  await page.getByLabel('Nickname', { exact: true }).fill('My nickname');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByRole('status')).toContainText('saved');
  await page.reload();
  await expect(page.getByLabel('Nickname', { exact: true })).toHaveValue('My nickname');
  await expect(page.locator('.account-identity')).toContainText('Google name');
  await expect(page.getByRole('navigation', { name: 'Account navigation' })).not.toContainText('Billing');
});

test('redeems once, updates balance/history and shows repeated redemption feedback', async ({ page }) => {
  const payload = await accountFixture(page);
  let redeemed = false;
  await page.route('**/api/account/redeem', async (route) => {
    const outcome = redeemed ? 'already_redeemed' : 'redeemed';
    if (!redeemed) { payload.account.freeCredits += 2; payload.redemptions.push({ id: 'code', label: 'QA reward', credits: 2, createdAt: '2026-09-01T00:00:00Z' }); }
    redeemed = true; await route.fulfill({ json: { outcome, awarded: 2 } });
  });
  await page.goto('/account/redeem');
  await page.getByLabel('Reward code', { exact: true }).fill('A'.repeat(32));
  await page.getByRole('button', { name: 'Redeem code', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Credits added');
  await expect(page.getByText('QA reward · +2 credits')).toBeVisible();
  await page.getByRole('button', { name: 'Redeem code', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('already redeemed');
  await expect(page.getByRole('heading', { name: 'Administrator · Reward codes' })).toHaveCount(0);
});

test('offers privacy controls and readable responsive navigation without payment controls', async ({ page }) => {
  await accountFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/account/security');
  await page.getByRole('button', { name: 'Cookie settings', exact: true }).first().click();
  await expect(page.locator('[data-cookie-consent]')).toBeVisible();
  // Exercise keyboard access; Astro's development toolbar overlaps this mobile corner.
  await page.locator('[data-consent-necessary]').press('Enter');
  await expect(page.getByRole('heading', { name: 'Sign-in & security' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto('/account/credits');
  await expect(page.getByRole('heading', { name: 'Credit history' })).toHaveCSS('color', 'rgb(10, 10, 10)');
  await expect(page.getByRole('button', { name: /checkout|subscribe|card/i })).toHaveCount(0);
});

test('administrator can create and disable a code with a one-time display', async ({ page }) => {
  await accountFixture(page, true);
  const codes: Array<{ id: string; label: string; credits: number; maxUses: number; usedCount: number; expiresAt: string; disabled: boolean }> = [];
  await page.route('**/api/account/codes', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { codes, redemptions: [] } });
    const data = route.request().postDataJSON(); codes.push({ ...data, id: data.requestId, usedCount: 0, disabled: false });
    return route.fulfill({ json: { code: 'B'.repeat(32) } });
  });
  await page.route('**/api/account/disable-code', async (route) => { codes[0].disabled = true; await route.fulfill({ json: { disabled: true } }); });
  await page.goto('/account/redeem');
  await page.getByLabel('Internal label').fill('QA test');
  await page.getByLabel('Expires at').fill('2030-01-01T12:00');
  await page.getByRole('button', { name: 'Create reward code' }).click();
  await expect(page.getByLabel('New reward code')).toHaveValue('B'.repeat(32));
  await page.getByRole('button', { name: 'Disable', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Disabled', exact: true })).toBeDisabled();
});

test('unauthenticated mutations and admin routes fail closed on the real local API', async ({ request }) => {
  expect((await request.get('/api/account/overview')).status()).toBe(401);
  expect((await request.post('/api/account/redeem', { data: { code: 'A'.repeat(32) } })).status()).toBe(403);
  expect((await request.get('/account/billing')).status()).toBe(404);
});
