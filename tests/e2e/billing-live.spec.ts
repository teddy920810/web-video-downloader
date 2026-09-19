import { expect, test } from '@playwright/test';

test('shows real prices and live purchase controls without test or closed-payment copy', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('streamnest-consent-v1', 'necessary'));
  await page.route('**/api/auth/get-session', route => route.fulfill({ json: {
    user: { id: 'fixture', email: 'fixture@example.test', name: 'Fixture' }, session: { id: 'fixture' },
  } }));
  let offer = '';
  await page.route('**/api/billing/checkout', route => {
    offer = route.request().postDataJSON().offer;
    return route.fulfill({ status: 503, json: { error: 'Fixture provider unavailable' } });
  });
  const response = await page.goto('/pricing');
  expect(response?.headers()['cache-control']).toContain('no-store');
  await expect(page.locator('.launch-notice')).toContainText('Secure checkout');
  await expect(page.getByRole('button', { name: 'Subscribe to Pro' })).toBeEnabled();
  await page.getByRole('radio', { name: '1,000 credits $15.00' }).check();
  await page.getByRole('button', { name: 'Buy this credit pack' }).click();
  await expect(page.getByRole('alert')).toContainText('Fixture provider unavailable');
  expect(offer).toBe('pack-1000');
  await expect(page.getByText(/Test mode|Purchases are not open yet/)).toHaveCount(0);
  expect(errors).toEqual([]);
});
