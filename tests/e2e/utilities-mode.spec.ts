import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

async function useAnonymousSession(page: import('@playwright/test').Page) {
  await page.route('**/api/auth/get-session', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: 'null',
  }));
}

test('utilities home exposes video and image tools without downloader surfaces', async ({ page }) => {
  await useAnonymousSession(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Work with media');
  await expect(page.getByRole('link', { name: 'Video Converter' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Video Compressor' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Background Remover' }).first()).toBeVisible();
  await expect(page.locator('#tools > a')).toHaveCount(11);
  const html = await page.locator('body').innerHTML();
  expect(html).not.toContain('Paste a video link');
  await expect(page.getByRole('button', { name: /Sign in with Google/i })).toBeVisible();
  expect(html).not.toContain('href="/blog');
  await expect(page.locator('#desktop-app')).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
});

test('utilities mode returns real 404 responses for downloader API and blog routes', async ({ request }) => {
  const api = await request.post('/api/downloads/inspect', { data: { url: 'https://example.com/video' } });
  expect(api.status()).toBe(404);
  expect(await api.json()).toEqual({ error: 'Not found.' });

  for (const path of ['/blog', '/blog/download-youtube-videos']) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
  }
});

test('utilities discovery files and legal pages exclude downloader content', async ({ request }) => {
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('/video-converter');
  expect(sitemap).toContain('/video-compressor');
  expect(sitemap).toContain('/background-remover');
  expect(sitemap).toContain('/video-trimmer');
  expect(sitemap).toContain('/image-resizer');
  expect(sitemap).toContain('/pricing');
  expect(sitemap).not.toContain('/account');
  expect(sitemap).not.toContain('/blog');

  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).not.toContain('Disallow: /blog');

  const privacy = await (await request.get('/privacy')).text();
  expect(privacy).toContain('Background Remover');
  expect(privacy).toContain('Cloudflare R2');
  expect(privacy).toContain('Google account');
  const terms = await (await request.get('/terms')).text();
  expect(terms).toContain('AI credits');
  expect(terms).toContain('Acceptable use');
  const refund = await request.get('/refund-policy');
  expect(refund.status()).toBe(200);
  expect(await refund.text()).toContain('Paid checkout is not currently available');
});

test('pricing and account surfaces describe current entitlements without enabling checkout', async ({ page }) => {
  await useAnonymousSession(page);
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Local tools stay free');
  await expect(page.locator('.account-hero p')).toHaveCSS('color', 'rgb(203, 213, 245)');
  await expect(page.getByRole('heading', { level: 2, name: 'Free' })).toHaveCSS('color', 'rgb(23, 35, 33)');
  await expect(page.getByRole('button', { name: 'Checkout coming soon' })).toBeDisabled();
  await page.goto('/account');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('tools, plan, and credits');
  await expect(page.locator('.account-hero p')).toHaveCSS('color', 'rgb(203, 213, 245)');
  await expect(page.getByRole('button', { name: 'Sign in with Google' }).first()).toBeVisible();
  await expect(page.locator('.account-empty')).toHaveCSS('color', 'rgb(23, 35, 33)');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
});

test('background remover expands into the shared workspace after image selection', async ({ page }) => {
  await page.goto('/background-remover');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Remove an image');
  await page.locator('input[type=file]').setInputFiles({
    name: 'tiny.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Av7+WQAAAABJRU5ErkJggg==', 'base64'),
  });
  await expect(page.locator('[data-workspace="true"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove background' })).toBeVisible();
});

test('utilities mode remains usable on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/video-compressor');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await page.locator('[data-mobile-menu-toggle]').click();
  await expect(page.locator('#site-navigation')).toBeVisible();
  await expect(page.locator('input[type=file]')).toBeVisible();
});

test('desktop Tools menu stays readable and closes when the mouse leaves', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Tools' });
  await trigger.hover();
  const panel = page.locator('.nav-dropdown-panel');
  await expect(panel.getByText('Video tools', { exact: true })).toBeVisible();
  await expect(panel.getByText('Audio tools', { exact: true })).toBeVisible();
  await expect(panel.getByText('Image tools', { exact: true })).toBeVisible();
  const converter = panel.getByRole('link', { name: 'Video Converter' });
  await expect(converter).toBeVisible();
  await expect(converter).toHaveCSS('color', 'rgb(23, 35, 33)');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.locator('main').hover({ position: { x: 5, y: 5 } });
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();
});

test('shared header and footer keep stable grouped navigation', async ({ page }) => {
  await page.goto('/');
  await page.setViewportSize({ width: 1440, height: 1000 });
  const header = page.locator('.site-header');
  await expect(header).toHaveCSS('display', 'grid');
  await expect(page.locator('.header-auth')).toHaveCSS('width', '190px');
  await expect(page.locator('.footer-link-group').getByRole('heading', { name: 'Video & audio tools' })).toBeVisible();
  await expect(page.locator('.footer-link-group').getByRole('heading', { name: 'Image tools' })).toBeVisible();
  await expect(page.locator('.footer-link-group').getByRole('heading', { name: 'Legal' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Refund Policy' })).toBeVisible();
  await expect(page.locator('.footer-social-links')).toHaveCount(0);
});
