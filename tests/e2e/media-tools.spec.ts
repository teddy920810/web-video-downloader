import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const tinyWebm = Buffer.from('GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAANXEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggElTbuMU6uEHFO7a1OsggNB7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZmNjIuMTMuMTAyV0GNTGF2ZjYyLjEzLjEwMkSJiEBxgAAAAAAAFlSua8iuAQAAAAAAAD/XgQFzxYghnd5Mt4yKdZyBACK1nIN1bmSIgQCGhVZfVlA4g4EBI+ODhAJiWgDgkLCBoLqBWpqBAlWwhFW5gQESVMNn/HNzoGPAgGfImkWjh0VOQ09ERVJEh41MYXZmNjIuMTMuMTAyc3PWY8CLY8WIIZ3eTLeMinVnyKFFo4dFTkNPREVSRIeUTGF2YzYyLjMwLjEwMCBsaWJ2cHhnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAwLjI4MDAwMDAwMAAfQ7Z1QZXngQCj1oEAAIAwBgCdASqgAFoAAEcIhYWImYSIAgICdaoD+AP6AgbKlqTnr0ZeI569GXiOevRl4jnr0ZeI569GXiOUAP7+wOv/8KVkoB7/wpr/6OJYrSZ/6LgAo7SBACgAsQMABRCsABgHT/gagfMNAAVsCsAFYAKwAVgArABWACD+8DhD22bZtjP/q7UOjRYAo7KBAFAAcQMABRCsABgAGLf0DAAEGgALAAWAAsABYACwAFf4/vA4Q9tm2bYz/6u1Do0WAKOygQB4AHEDAAUQrAAYABi39AwABBoACwAFgALAAWAAsABX+P7wOEPbZtm2M/+rtQ6NFgCjsoEAoABxAwAFEKwAGAAYt/QMAAQaAAsABYACwAFgALAAV/j+8DhD22bZtjP/q7UOjRYAo7KBAMgAcQMABRCsABgAGLf0DAAEGgALAAWAAsABYACwAFf4/vA4Q9tm2bYz/6u1Do0WAKOygQDwAHEDAAUQrAAYABi39AwABBoACwAFgALAAWAAsABX+P7wOEPbZtm2M/+rtQ6NFgAcU7trkbuPs4EAt4r3gQHxggGm8IED', 'base64');

function trackProcessingApiRequests(page: import('@playwright/test').Page) {
  const requests: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/') && !path.startsWith('/api/auth/')) requests.push(request.url());
  });
  return requests;
}

test('media tools remain private, responsive, and accessible before processing', async ({ page }) => {
  const apiRequests = trackProcessingApiRequests(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/video-compressor');

  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.locator('.local-media-privacy')).toContainText('Your selected video stays on this device');
  await expect(page.locator('input[type=file]')).toHaveAttribute('accept', 'video/*');
  expect(apiRequests).toEqual([]);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
});

test('rejects a non-video locally without making an API request', async ({ page }) => {
  const apiRequests = trackProcessingApiRequests(page);
  await page.goto('/video-converter');
  await page.locator('input[type=file]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a video') });

  await expect(page.getByRole('alert')).toContainText('supported video');
  expect(apiRequests).toEqual([]);
});

test('converts and compresses a tiny generated video entirely in the browser', async ({ page }) => {
  test.setTimeout(120_000);
  const apiRequests = trackProcessingApiRequests(page);
  await page.goto('/video-converter');
  await page.locator('input[type=file]').setInputFiles({ name: 'tiny.webm', mimeType: 'video/webm', buffer: tinyWebm });
  await page.getByRole('button', { name: 'Convert locally' }).click();

  const result = page.getByRole('link', { name: 'Save converted.mp4' });
  const alert = page.getByRole('alert');
  await expect(result.or(alert)).toBeVisible({ timeout: 90_000 });
  await expect(alert).toHaveCount(0);
  await expect(result).toHaveAttribute('href', /^blob:/);
  expect(apiRequests).toEqual([]);

  await page.goto('/video-compressor');
  await page.locator('input[type=file]').setInputFiles({ name: 'tiny.webm', mimeType: 'video/webm', buffer: tinyWebm });
  await page.getByRole('button', { name: 'Compress locally' }).click();
  const compressed = page.getByRole('link', { name: 'Save compressed-balanced.mp4' });
  await expect(compressed).toBeVisible({ timeout: 90_000 });
  await expect(compressed).toHaveAttribute('href', /^blob:/);
  expect(apiRequests).toEqual([]);
});

test('processes an image locally and publishes every low-cost tool route', async ({ page, request }) => {
  for (const path of ['/video-trimmer', '/video-merger', '/audio-extractor', '/video-to-gif', '/image-converter', '/image-compressor', '/image-resizer', '/svg-to-image']) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
  await page.goto('/image-converter');
  await page.locator('input[type=file]').setInputFiles('public/assets/blog/download-youtube-videos.webp');
  await page.getByRole('button', { name: 'Convert locally' }).click();
  const result = page.getByRole('link', { name: 'Save converted.png' });
  await expect(result).toBeVisible();
  await expect(result).toHaveAttribute('href', /^blob:/);
});

test('converts SVG code and a fetched SVG URL into selected local image formats', async ({ page }) => {
  const apiRequests = trackProcessingApiRequests(page);
  await page.route('https://assets.example.test/icon.svg', (route) => route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="3" height="2"><rect width="3" height="2" fill="#2563eb"/></svg>',
  }));
  await page.goto('/svg-to-image');
  await page.getByLabel('SVG code').fill('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#2563eb"/></svg>');
  let downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save PNG' }).click();
  let download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('streamnest-svg.png');
  let stream = await download.createReadStream();
  let chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');

  await page.getByRole('button', { name: 'Use URL' }).click();
  await page.getByLabel('SVG URL').fill('https://assets.example.test/icon.svg');
  downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save PNG' }).click();
  download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('streamnest-svg.png');
  await expect(page.getByRole('img', { name: 'Converted SVG preview' })).toBeVisible();

  await page.getByLabel('Output format').selectOption('jpeg');
  downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save JPG' }).click();
  download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('streamnest-svg.jpg');
  stream = await download.createReadStream();
  chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).subarray(0, 3).toString('hex')).toBe('ffd8ff');
  expect(apiRequests).toEqual([]);
});

test('shows the shared loading treatment while a local image is processing', async ({ page }) => {
  await page.addInitScript(() => {
    const originalCreateImageBitmap = window.createImageBitmap.bind(window);
    Object.defineProperty(window, 'createImageBitmap', {
      configurable: true,
      value: async (image: ImageBitmapSource, options?: ImageBitmapOptions) => {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        return originalCreateImageBitmap(image, options);
      },
    });
  });
  await page.goto('/image-converter');
  await page.locator('input[type=file]').setInputFiles('public/assets/blog/download-youtube-videos.webp');
  await page.getByRole('button', { name: 'Convert locally' }).click();

  await expect(page.getByRole('status')).toContainText('Processing locally…');
  await expect(page.getByRole('link', { name: 'Save converted.png' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('bakes the selected background color into the downloaded PNG', async ({ page }) => {
  await page.route('**/api/auth/get-session', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ user: { id: 'google-user-1', name: 'Test User', email: 'test@example.com' }, session: { id: 'session-1' } }),
  }));
  await page.route('**/api/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ account: { freeCredits: 1, paidCredits: 0 }, usage: [], canGrantTestCredits: false }),
  }));
  await page.goto('/background-remover');
  const transparentPng = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error('PNG unavailable')),
      'image/png',
    ));
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  await page.route('https://upload.example.test/input.png', (route) => route.fulfill({ status: 200 }));
  await page.route(/\/api\/background-remover\/upload-url$/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ jobId: 'eb8fa168-c11c-4e54-8c63-137d649ed1db', inputKey: 'tool-inputs/background-remover/eb8fa168-c11c-4e54-8c63-137d649ed1db.png', uploadUrl: 'https://upload.example.test/input.png' }),
  }));
  await page.route(/\/api\/background-remover$/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ downloadUrl: 'https://result.example.test/output.png' }),
  }));
  await page.route('https://result.example.test/output.png', (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: Buffer.from(transparentPng),
  }));

  await page.locator('input[type=file]').first().setInputFiles({ name: 'transparent.png', mimeType: 'image/png', buffer: Buffer.from(transparentPng) });
  await page.getByRole('button', { name: 'Remove background' }).click();
  await expect(page.getByRole('button', { name: 'Download PNG' })).toBeVisible();
  await page.getByRole('button', { name: '#3b82f6' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('streamnest-background-removed.png');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const encoded = Buffer.concat(chunks).toString('base64');
  const pixel = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return [...context.getImageData(0, 0, 1, 1).data];
  }, encoded);
  expect(pixel).toEqual([59, 130, 246, 255]);
});
