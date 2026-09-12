import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { TOOLS } from '../../src/lib/product/catalog';

// Selection tests only need a tiny image; real encoding/export fixtures stay in batch-tools.spec.ts.
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Av7+WQAAAABJRU5ErkJggg==', 'base64');
const video = readFileSync(new URL('../fixtures/batch-video.webm', import.meta.url));
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="blue"/></svg>');

for (const tool of TOOLS.filter(tool => tool.id !== 'video-merger')) {
  test(`${tool.id}: file count selects the editor for both picker and drop`, async ({ page }) => {
    test.setTimeout(60_000);
    const paid: string[] = [];
    page.on('request', request => {
      if (request.method() === 'POST' && request.url().includes('/api/background-remover')) paid.push(request.url());
    });
    const item = tool.id === 'svg-to-image'
      ? { name: 'test.svg', mimeType: 'image/svg+xml', buffer: svg }
      : tool.category === 'image'
        ? { name: 'photo.png', mimeType: 'image/png', buffer: image }
        : { name: 'clip.webm', mimeType: 'video/webm', buffer: video };
    for (const source of ['picker', 'drop']) {
      await page.goto(tool.route);
      await expect(page.locator('input[type=file]')).toHaveCount(1);
      await expect(page.locator('astro-island[ssr]').filter({ has: page.locator('input[type=file]') })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Batch processing/ })).toHaveCount(0);
      await expect(page.locator('input[type=file]')).toHaveAttribute('multiple', '');
      const upload = async (count: number) => {
        if (source === 'picker') return page.locator('input[type=file]').setInputFiles(Array.from({ length: count }, () => item));
        const data = await page.evaluateHandle(({ count, name, type, bytes }) => {
          const transfer = new DataTransfer();
          for (let i = 0; i < count; i++) transfer.items.add(new File([new Uint8Array(bytes)], name, { type }));
          return transfer;
        }, { count, name: item.name, type: item.mimeType, bytes: [...item.buffer] });
        await page.locator('.local-media-tool, .background-remover-tool').first().dispatchEvent('drop', { dataTransfer: data });
        await data.dispose();
      };
      await upload(1);
      if (tool.id === 'svg-to-image') await expect(page.getByRole('textbox', { name: 'SVG code', exact: true })).toHaveValue(svg.toString());
      else await expect(page.locator('.local-media-tool, .background-remover-tool').first()).toHaveAttribute('data-workspace', 'true');
      await expect(page.locator('.batch-workspace')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Start queue', exact: true })).toHaveCount(0);
      if (source === 'picker') {
        await page.locator('input[type=file]').setInputFiles([]);
        if (tool.id === 'svg-to-image') await expect(page.getByRole('textbox', { name: 'SVG code', exact: true })).toHaveValue(svg.toString());
        else await expect(page.locator('.local-media-tool, .background-remover-tool').first()).toHaveAttribute('data-workspace', 'true');
      }
      await upload(2);
      await expect(page.locator('.batch-list > li[data-status=queued]')).toHaveCount(2);
      await expect(page.getByRole('button', { name: 'Choose other files', exact: true })).toBeVisible();
      await expect(page.locator('.batch-list > li[data-status=processing]')).toHaveCount(0);
      page.once('dialog', dialog => dialog.accept());
      await page.getByRole('button', { name: 'Choose other files', exact: true }).click();
      await expect(page.locator('.batch-workspace')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Batch processing/ })).toHaveCount(0);
    }
    expect(paid).toEqual([]);
  });
}

test('merger treats multiple clips as one merge, with no mode choice', async ({ page }) => {
  await page.goto('/video-merger');
  await expect(page.getByRole('button', { name: /Batch processing/ })).toHaveCount(0);
  const item = { name: 'clip.webm', mimeType: 'video/webm', buffer: video };
  await page.locator('input[type=file]').setInputFiles([item, item]);
  await expect(page.locator('.batch-list > li')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Merge video clips', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Merge locally', exact: true })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles([item, item]);
  await expect(page.locator('.batch-list > li')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Start queue', exact: true })).toBeVisible();
});
