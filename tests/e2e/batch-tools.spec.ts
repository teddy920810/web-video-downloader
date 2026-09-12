import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import AxeBuilder from '@axe-core/playwright';
import { TOOLS } from '../../src/lib/product/catalog';

const image = readFileSync(new URL('../../public/uploads/image-compressor/feature-quality-control.webp', import.meta.url));
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="blue"/></svg>');
const video = () => readFileSync(new URL('../fixtures/batch-video.webm', import.meta.url));
test.beforeEach(async ({ page }) => { page.on('dialog', dialog => dialog.accept()); });

test('multiple files open the workspace and file preview does not change download selection', async ({ page }) => {
  await page.goto('/image-resizer');
  const item = { name: 'photo.webp', mimeType: 'image/webp', buffer: image };
  await page.locator('input[type=file]').setInputFiles([item, item]);
  await expect(page.locator('.batch-list > li')).toHaveCount(2);
  await page.getByRole('button', { name: 'Start queue', exact: true }).click();
  await expect(page.locator('.batch-list > li[data-status=ready]')).toHaveCount(2);
  await page.getByRole('checkbox', { name: 'Select result 2', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Preview task 2' }).click();
  await expect(page.getByRole('checkbox', { name: 'Select result 2', exact: true })).not.toBeChecked();
  await expect(page.getByAltText('Processed result')).toHaveJSProperty('naturalWidth', 1280);
  const audit = await new AxeBuilder({ page }).include('.batch-workspace').analyze();
  expect(audit.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);
});

test('AI batch checks the entire pending cost before any paid request', async ({ page }) => {
  await page.route('**/api/auth/get-session', r => r.fulfill({ json: { user: { id: 'test', name: 'Test' }, session: { id: 'test' } } }));
  await page.route('**/api/me', r => r.fulfill({ json: { account: { freeCredits: 1, paidCredits: 0 } } }));
  let paidRequests = 0;
  await page.route('**/api/background-remover/**', r => { paidRequests++; return r.abort(); });
  await page.goto('/background-remover');
  const item = { name: 'photo.webp', mimeType: 'image/webp', buffer: image };
  await page.locator('input[type=file]').setInputFiles([item, item]);
  await page.getByRole('button', { name: 'Start queue', exact: true }).click();
  await expect(page.locator('.batch-message')).toContainText('needs 2 AI credits');
  expect(paidRequests).toBe(0);
  await expect(page.locator('.batch-list > li[data-status=queued]')).toHaveCount(2);
});

test('merge groups support clip ordering and removal before processing', async ({ page }) => {
  await page.goto('/video-merger');
  const make = (name: string) => ({ name, mimeType: 'video/webm', buffer: video() });
  await page.locator('input[type=file]').setInputFiles([make('first.webm'), make('second.webm'), make('third.webm')]);
  await page.getByRole('button', { name: 'Move clip 2 up', exact: true }).click();
  await expect(page.locator('.batch-clip-name').first()).toHaveText('1. second.webm');
  await page.getByRole('button', { name: 'Remove clip 3', exact: true }).click();
  await expect(page.locator('.batch-clips > li')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Remove clip 2', exact: true })).toBeDisabled();
});

async function saveFirst(page: Page) {
  const download = page.waitForEvent('download');
  await page.locator('.batch-list a[download]').first().click();
  const item = await download;
  expect(await item.failure()).toBeNull();
  return readFileSync((await item.path())!);
}

test('all 11 file tools accept dropped files into a queue without starting paid work', async ({ page }) => {
  test.setTimeout(120_000);
  const paid: string[] = [];
  page.on('request', r => { if (r.method() === 'POST' && r.url().includes('/api/background-remover')) paid.push(r.url()); });
  for (const tool of TOOLS) {
    await page.goto(tool.route);
    await expect(page.locator('input[type=file]')).toHaveCount(1);
    await expect(page.locator('astro-island[ssr]').filter({ has: page.locator('input[type=file]') })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Batch processing/ })).toHaveCount(0);
    const svgTool = tool.id === 'svg-to-image';
    const videoTool = tool.category !== 'image';
    const dropped = await page.evaluateHandle(({ svgTool, videoTool }) => {
      const data = new DataTransfer();
      for (let i = 0; i < 2; i++) data.items.add(new File(['test'], `test-${i}.${svgTool ? 'svg' : videoTool ? 'webm' : 'png'}`, { type: svgTool ? 'image/svg+xml' : videoTool ? 'video/webm' : 'image/png' }));
      return data;
    }, { svgTool, videoTool });
    await page.locator('.local-media-tool, .background-remover-tool').first().dispatchEvent('drop', { dataTransfer: dropped });
    await expect(page.locator('.batch-list > li')).toHaveCount(tool.id === 'video-merger' ? 1 : 2);
    await expect(page.locator('.batch-list [data-status="processing"]')).toHaveCount(0);
    await dropped.dispose();
  }
  expect(paid).toEqual([]);
});

for (const route of ['image-converter', 'image-compressor', 'image-resizer', 'svg-to-image']) {
  test(`${route} runs multiple files and downloads a real result`, async ({ page }) => {
    await page.goto(`/${route}`);
    const item = route === 'svg-to-image' ? { name: 'same.svg', mimeType: 'image/svg+xml', buffer: svg } : { name: 'same.webp', mimeType: 'image/webp', buffer: image };
    await page.locator('input[type=file]').setInputFiles([item, item]);
    if (route === 'image-compressor') await page.getByLabel('Target size (optional)').fill('60');
    await page.getByRole('button', { name: 'Start queue', exact: true }).click();
    await expect(page.locator('.batch-list > li[data-status="ready"]')).toHaveCount(2, { timeout: 30000 });
    const bytes = await saveFirst(page);
    expect(bytes.length).toBeGreaterThan(20);
    await expect(page.locator('.batch-preview')).toBeVisible();
    await page.getByRole('checkbox', { name: 'Select result 2', exact: true }).uncheck();
    const archiveEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download selected.*ZIP/ }).click();
    const archive = await archiveEvent;
    expect(await archive.failure()).toBeNull();
    const extracted = unzipSync(new Uint8Array(readFileSync((await archive.path())!)));
    expect(Object.keys(extracted)).toHaveLength(1);
    expect(Object.values(extracted)[0]).toEqual(new Uint8Array(bytes));
    if (route === 'image-compressor') expect(bytes.length).toBeLessThanOrEqual(60 * 1024);
    expect(await page.locator('.batch-list a').evaluateAll(links => links.map(link => link.getAttribute('download')))).toEqual(expect.arrayContaining([expect.stringMatching(/^1-/), expect.stringMatching(/^2-/)]));
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('invalid image does not block later files; impossible target has no success download', async ({ page }) => {
  await page.goto('/image-compressor');
  await page.locator('input[type=file]').setInputFiles([{ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('bad') }, { name: 'ok.webp', mimeType: 'image/webp', buffer: image }]);
  await page.getByRole('button', { name: 'Start queue', exact: true }).click();
  await expect(page.locator('.batch-list > li[data-status="failed"]')).toHaveCount(1);
  await expect(page.locator('.batch-list > li[data-status="ready"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Choose other files' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'ok.webp', mimeType: 'image/webp', buffer: image });
  await page.getByLabel('Target size (optional)').fill('0.01');
  await page.getByRole('button', { name: 'Compress locally', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('target size');
  await expect(page.locator('a[download]')).toHaveCount(0);
});

for (const route of ['video-converter', 'video-compressor', 'video-trimmer', 'audio-extractor', 'video-to-gif', 'video-merger']) {
  test(`${route} processes sequential tasks with the real WASM engine`, async ({ page }) => {
    test.setTimeout(180_000);
    const processing: string[] = [];
    page.on('request', r => { if (r.method() === 'POST') processing.push(r.url()); });
    await page.goto(`/${route}`);
    const item = { name: 'test.webm', mimeType: 'video/webm', buffer: video() };
    await page.locator('input[type=file]').setInputFiles([item, item]);
    if (route === 'video-merger') await page.locator('input[type=file]').setInputFiles([item, item]);
    if (route === 'video-compressor') { await page.getByLabel('Target size (optional)').fill('20'); await page.getByLabel('Size unit').selectOption('KB'); }
    if (route === 'video-to-gif') await page.getByLabel('Duration · seconds', { exact: true }).fill('1');
    if (route === 'video-trimmer') await page.getByLabel('End · seconds').fill('0.5');
    await page.getByRole('button', { name: 'Start queue', exact: true }).click();
    await expect(page.locator('.batch-list > li[data-status="ready"]')).toHaveCount(2, { timeout: 150_000 });
    const bytes = await saveFirst(page);
    expect(bytes.length).toBeGreaterThan(100);
    await expect(page.locator('.batch-preview video, .batch-preview audio, .batch-preview img')).toBeVisible();
    const archiveEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download all · ZIP', exact: true }).click();
    const archive = await archiveEvent;
    expect(await archive.failure()).toBeNull();
    expect(Object.keys(unzipSync(new Uint8Array(readFileSync((await archive.path())!))))).toHaveLength(2);
    if (route === 'video-compressor') expect(bytes.length).toBeLessThanOrEqual(20 * 1024);
    if (route === 'video-compressor') {
      const duration = await page.locator('.batch-list a').first().evaluate(async (link: HTMLAnchorElement) => {
        const media = document.createElement('video');
        return await new Promise<number>((resolve, reject) => {
          media.onloadedmetadata = () => { resolve(media.duration); media.removeAttribute('src'); media.load(); };
          media.onerror = () => reject(new Error('Downloaded video is not playable'));
          media.src = link.href;
        });
      });
      expect(duration).toBeGreaterThanOrEqual(0.95);
    }
    expect(processing).toEqual([]);
  });
}

test('AI batch is serial, stops after current and exports the selected blue background', async ({ page }) => {
  await page.route('**/api/auth/get-session', r => r.fulfill({ json: { user: { id: 'batch-test', name: 'Test', email: 'test@example.test' }, session: { id: 'test' } } }));
  await page.route('**/api/me', r => r.fulfill({ json: { account: { freeCredits: 2, paidCredits: 0 } } }));
  await page.goto('/background-remover');
  const transparent = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2;
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/png'));
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  let starts = 0;
  let active = 0;
  let peak = 0;
  await page.route('**/api/background-remover/upload-url', r => { starts++; return r.fulfill({ json: { jobId: `job-${starts}`, inputKey: `input-${starts}`, uploadUrl: 'https://batch.example.test/upload' } }); });
  await page.route('https://batch.example.test/upload', r => r.fulfill({ status: 200 }));
  await page.route(/\/api\/background-remover$/, async r => {
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 700));
    active--;
    await r.fulfill({ json: { downloadUrl: 'https://batch.example.test/result' } });
  });
  await page.route('https://batch.example.test/result', r => r.fulfill({ contentType: 'image/png', body: Buffer.from(transparent) }));
  const item = { name: 'source.png', mimeType: 'image/png', buffer: Buffer.from(transparent) };
  await page.locator('input[type=file]').setInputFiles([item, item]);
  await page.getByRole('group', { name: 'Background color', exact: true }).getByRole('button', { name: 'Blue', exact: true }).click();
  await page.getByRole('button', { name: 'Start queue', exact: true }).click();
  await page.getByRole('button', { name: 'Stop after current' }).click();
  await expect(page.locator('.batch-list > li[data-status="ready"]')).toHaveCount(1);
  await expect(page.locator('.batch-list > li[data-status="queued"]')).toHaveCount(1);
  expect(starts).toBe(1);
  await page.getByRole('button', { name: 'Start queue', exact: true }).click();
  await expect(page.locator('.batch-list > li[data-status="ready"]')).toHaveCount(2);
  expect(starts).toBe(2); expect(peak).toBe(1);
  const bytes = await saveFirst(page);
  const pixel = await page.evaluate(async data => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2;
    const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0); bitmap.close();
    return [...context.getImageData(0, 0, 1, 1).data];
  }, [...bytes]);
  expect(pixel).toEqual([59, 130, 246, 255]);
  await page.getByRole('group', { name: 'Result background', exact: true }).getByRole('button', { name: 'Green', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Apply to all completed' })).toBeEnabled();
  const recolored = await saveFirst(page);
  const newPixel = await page.evaluate(async data => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2;
    const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0); bitmap.close();
    return [...context.getImageData(0, 0, 1, 1).data];
  }, [...recolored]);
  expect(newPixel).toEqual([34, 197, 94, 255]);
  expect(starts).toBe(2);
});
