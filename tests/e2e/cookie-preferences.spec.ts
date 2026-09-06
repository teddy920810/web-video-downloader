import { expect, test } from '@playwright/test';

test('preference manager never grants analytics simply by opening and supports accept then revoke', async ({ page }) => {
  const tags: string[] = [];
  await page.route('https://www.googletagmanager.com/**', async (route) => { tags.push(route.request().url()); await route.fulfill({ contentType: 'application/javascript', body: '' }); });
  await page.goto('http://www.streamnest.io:4391/');
  const banner = page.locator('[data-cookie-consent]');
  await banner.getByRole('button', { name: 'Manage preferences' }).click();
  await expect(banner.getByLabel('Necessary cookies')).toBeChecked();
  await expect(banner.getByLabel('Necessary cookies')).toBeDisabled();
  await expect(banner.getByLabel('Analytics cookies')).not.toBeChecked();
  expect(tags).toEqual([]);
  await banner.getByRole('button', { name: 'Save preferences' }).click();
  await expect(banner).toBeHidden();
  expect(tags).toEqual([]);
  await page.getByRole('button', { name: 'Cookie settings' }).click();
  await banner.getByRole('button', { name: 'Manage preferences' }).click();
  await banner.getByLabel('Analytics cookies').check();
  await banner.getByRole('button', { name: 'Save preferences' }).click();
  await expect.poll(() => tags.length).toBe(1);
  await page.getByRole('button', { name: 'Cookie settings' }).click();
  await banner.getByRole('button', { name: 'Manage preferences' }).click();
  await expect(banner.getByLabel('Analytics cookies')).toBeChecked();
  await banner.getByLabel('Analytics cookies').uncheck();
  await banner.getByRole('button', { name: 'Save preferences' }).click();
  expect(await page.evaluate(() => localStorage.getItem('streamnest-consent-v1'))).toBe('necessary');
  const last = await page.evaluate(() => {
    if (!('dataLayer' in window) || !Array.isArray(window.dataLayer)) throw new Error('Missing consent command queue');
    const update = window.dataLayer.filter((item) => item[0] === 'consent' && item[1] === 'update').at(-1);
    if (!update) throw new Error('Missing consent update');
    return Array.from(update);
  });
  expect(last[2]).toMatchObject({ analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  await page.reload();
  await expect(banner).toBeHidden();
  expect(tags).toHaveLength(1);
});

test('cookie choices fit a phone and keep equally visible accept and reject actions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const banner = page.locator('[data-cookie-consent]');
  await expect(banner.getByRole('button', { name: 'Accept all', exact: true })).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Reject optional' })).toBeVisible();
  await banner.getByRole('button', { name: 'Manage preferences' }).press('Enter');
  const box = await banner.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  expect(box!.height).toBeLessThan(800);
  await banner.getByRole('button', { name: 'Save preferences' }).press('Enter');
  await expect(banner).toBeHidden();
});
