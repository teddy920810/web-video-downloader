import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { TOOLS } from '../../src/lib/product/catalog';

test('compressor Word content, illustrations and local download work together', async ({ page }) => {
  const processingRequests: string[] = [];
  page.on('request', (request) => { if (request.url().includes('/api/tools/')) processingRequests.push(request.url()); });
  await page.goto('/image-compressor');
  await expect(page).toHaveTitle(/Free Image Compressor Online/);
  await expect(page.locator('main h1')).toHaveText('Compress ImagesOnline');
  await expect(page.locator('[data-guide-feature]')).toHaveCount(3);
  const illustrations = page.locator('.tool-guide-image');
  await expect(illustrations).toHaveCount(3);
  for (const illustration of await illustrations.all()) {
    await illustration.scrollIntoViewIfNeeded();
    await expect(illustration).toHaveJSProperty('naturalWidth', 1672);
  }
  await expect(page.locator('.tool-guide-supporting')).toHaveCount(2);
  await expect(page.locator('.tool-guide-faq details')).toHaveCount(6);
  await page.locator('.tool-guide-final-cta a').click();
  await expect(page).toHaveURL(/#compressor-image-tool-title$/);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('input[type=file]').setInputFiles({
    name: 'source.webp', mimeType: 'image/webp',
    buffer: readFileSync(new URL('../../public/uploads/image-compressor/feature-quality-control.webp', import.meta.url)),
  });
  await page.getByRole('slider').fill('0.35');
  await page.getByRole('button', { name: 'Compress locally', exact: true }).click();
  const save = page.getByRole('link', { name: 'Save compressed.webp' });
  await expect(save).toBeVisible();
  await expect(page.getByAltText('Processed image preview')).toHaveJSProperty('naturalWidth', 1672);
  const downloadPromise = page.waitForEvent('download');
  await save.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('compressed.webp');
  expect(await download.failure()).toBeNull();
  const bytes = readFileSync((await download.path())!);
  expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
  expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
  expect(bytes.length).toBeGreaterThan(100);
  expect(bytes.length).toBeLessThan(1165830);
  expect(processingRequests).toEqual([]);
});

test('every tool has Features, three steps and keyboard-accessible FAQs below an unchanged hero', async ({ page }) => {
  for (const tool of TOOLS) {
    const content = JSON.parse(readFileSync(new URL(`../../src/content/tool-guides/${tool.id}.json`, import.meta.url), 'utf8'));
    await page.goto(tool.route);
    const hero = page.locator('.utility-hero');
    await expect(hero.locator('h1')).toHaveCount(1);
    const guide = page.locator('[data-tool-guide]');
    await expect(guide).toBeVisible();
    await expect(guide.locator('[data-guide-feature]')).toHaveCount(content.features.items.length);
    await expect(guide.locator('details')).toHaveCount(content.faq.items.length);
    await expect(guide.locator('[data-guide-step]')).toHaveCount(3);
    const faq = guide.locator('details').first();
    await faq.locator('summary').press('Enter');
    await expect(faq).toHaveAttribute('open', '');
    await expect(faq.locator('p')).toBeVisible();
    await faq.locator('summary').press('Enter');
    await expect(faq).not.toHaveAttribute('open', '');
    await expect(page.locator('main h1')).toHaveCount(1);
  }
});

test('tool guide remains readable on a narrow screen and does not trigger media processing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const jobs: string[] = [];
  page.on('request', (request) => { if (request.url().includes('/api/tools/')) jobs.push(request.url()); });
  await page.goto('/video-compressor');
  const guide = page.locator('[data-tool-guide]');
  await expect(guide).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await guide.locator('summary').first().press('Enter');
  await expect(guide.locator('details[open] p')).toBeVisible();
  expect(jobs).toEqual([]);
});
