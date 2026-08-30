import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('utilities home exposes only local converter and compressor surfaces', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Work with video');
  await expect(page.getByRole('link', { name: 'Video Converter' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Video Compressor' }).first()).toBeVisible();
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
  expect(sitemap).not.toContain('/blog');

  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).not.toContain('Disallow: /blog');

  const privacy = await (await request.get('/privacy')).text();
  expect(privacy).toContain('Your selected video stays on your device');
  expect(privacy).not.toContain('Cloudflare R2');
  expect(privacy).toContain('Google sign-in');
});

test('utilities mode remains usable on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/video-compressor');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await page.locator('[data-mobile-menu-toggle]').click();
  await expect(page.locator('#site-navigation')).toBeVisible();
  await expect(page.locator('input[type=file]')).toBeVisible();
});
