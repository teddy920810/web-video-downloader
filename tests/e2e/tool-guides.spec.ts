import { expect, test } from '@playwright/test';
import { TOOLS } from '../../src/lib/product/catalog';

test('every tool has Features, three steps and keyboard-accessible FAQs below an unchanged hero', async ({ page }) => {
  for (const tool of TOOLS) {
    await page.goto(tool.route);
    const hero = page.locator('.utility-hero');
    await expect(hero.locator('h1')).toHaveCount(1);
    const guide = page.locator('[data-tool-guide]');
    await expect(guide).toBeVisible();
    await expect(guide.locator('[data-guide-feature]')).toHaveCount(2);
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
