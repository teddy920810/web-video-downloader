import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/get-session', (route) => route.fulfill({ contentType: 'application/json', body: 'null' }));
  await page.addInitScript(() => localStorage.setItem('streamnest-consent-v1', 'necessary'));
});

test('compares the confirmed prices without starting a purchase', async ({ page }) => {
  const mutations: string[] = [];
  page.on('request', (request) => { if (request.method() === 'POST') mutations.push(request.url()); });
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your tools, your pace.');
  await expect(page.locator('.plan-pro')).toContainText('$4.99');
  await expect(page.locator('.plan-pro')).toContainText('500 credits');
  const pack = page.locator('.plan-packs');
  for (const [credits, price] of [['300', '$4.50'], ['1,000', '$15.00'], ['2,000', '$30.00'], ['10,000', '$150.00']]) {
    await pack.getByRole('radio', { name: `${credits} credits ${price}`, exact: true }).check();
    await expect(pack.locator('.plan-price')).toContainText(price);
    await expect(pack.locator('.plan-allowance strong')).toContainText(`${credits} credits`);
  }
  await expect(pack).toContainText('24 months');
  await expect(pack.getByRole('button', { name: 'Purchases not open yet' })).toBeDisabled();
  await expect(page.locator('.plan-pro').getByRole('button', { name: 'Purchases not open yet' })).toBeDisabled();
  await page.getByText('What happens when I cancel Pro?', { exact: true }).click();
  await expect(page.locator('details[open]')).toContainText('separately purchased');
  expect(mutations).toEqual([]);
  const results = await new AxeBuilder({ page }).include('.streamnest-pricing').analyze();
  expect(results.violations).toEqual([]);
});

test('keeps all pack options usable on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/pricing');
  await page.getByRole('radio', { name: '10,000 credits $150.00', exact: true }).check();
  await expect(page.locator('.plan-packs .plan-price')).toContainText('$150.00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('exposes the operator, support and agreed refund terms on public pages', async ({ page }) => {
  for (const path of ['/pricing', '/terms', '/privacy', '/refund-policy', '/account']) {
    await page.goto(path);
    await expect(page.locator('.site-footer').getByRole('link', { name: 'support@streamnest.io', exact: true })).toHaveAttribute('href', 'mailto:support@streamnest.io');
  }
  await page.goto('/refund-policy');
  await expect(page.locator('main')).toContainText('Yao Shi');
  await expect(page.locator('main')).toContainText('7 calendar days');
  await expect(page.locator('main')).toContainText('including renewals');
  await expect(page.locator('main')).toContainText('3 business days');
});
