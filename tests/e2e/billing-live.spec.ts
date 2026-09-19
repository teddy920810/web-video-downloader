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
  await expect(page.locator('.launch-notice')).toContainText('Sign in');
  await expect(page.getByRole('button', { name: 'Subscribe to Pro' })).toBeEnabled();
  await page.getByRole('radio', { name: '1,000 credits $15.00' }).check();
  await page.getByRole('button', { name: 'Buy this credit pack' }).click();
  await expect(page.getByRole('alert')).toContainText('Fixture provider unavailable');
  expect(offer).toBe('pack-1000');
  await expect(page.getByText(/Test mode|Purchases are not open yet/)).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const offer of ['pack-1000', 'pro-monthly-500']) {
  test(`resumes ${offer} once after Google sign-in, keeping its retry key`, async ({ page }) => {
    let signedIn = false;
    let callback = '';
    const requests: Array<{ offer: string; requestId: string }> = [];
    await page.addInitScript(() => localStorage.setItem('streamnest-consent-v1', 'necessary'));
    await page.route('**/api/auth/get-session', route => route.fulfill({ json: signedIn ? {
      user: { id: 'fixture', email: 'fixture@example.test', name: 'Fixture' }, session: { id: 'fixture' },
    } : null }));
    await page.route('**/api/auth/sign-in/social', route => {
      callback = route.request().postDataJSON().callbackURL;
      return route.fulfill({ json: { redirect: false } });
    });
    await page.route('**/api/billing/checkout', route => {
      requests.push(route.request().postDataJSON());
      return route.fulfill({ status: 503, json: { error: 'Fixture provider unavailable' } });
    });
    await page.goto('/pricing');
    const label = offer === 'pro-monthly-500' ? 'Subscribe to Pro' : 'Buy this credit pack';
    if (offer === 'pack-1000') await page.getByRole('radio', { name: '1,000 credits $15.00' }).check();
    await page.getByRole('button', { name: label }).click();
    await expect.poll(() => callback).toContain('checkout=resume');
    expect(requests).toHaveLength(0);
    signedIn = true;
    await page.goto(callback);
    await expect(page.getByRole('alert')).toContainText('Fixture provider unavailable');
    expect(requests).toHaveLength(1);
    expect(requests[0].offer).toBe(offer);
    if (offer === 'pack-1000') await expect(page.getByRole('radio', { name: '1,000 credits $15.00' })).toBeChecked();
    await page.getByRole('button', { name: label }).click();
    await expect.poll(() => requests.length).toBe(2);
    expect(requests[0]).toEqual(requests[1]);
    await page.reload();
    await expect(page.getByRole('button', { name: label })).toBeEnabled();
    expect(requests).toHaveLength(2);
  });
}

test('a resume URL alone never initiates checkout', async ({ page }) => {
  await page.route('**/api/auth/get-session', route => route.fulfill({ json: {
    user: { id: 'fixture', email: 'fixture@example.test' }, session: { id: 'fixture' },
  } }));
  let attempts = 0;
  await page.route('**/api/billing/checkout', route => { attempts++; return route.abort(); });
  await page.goto('/pricing?checkout=resume&offer=pack-1000');
  await expect(page.getByRole('button', { name: 'Buy this credit pack' })).toBeEnabled();
  expect(attempts).toBe(0);
});
