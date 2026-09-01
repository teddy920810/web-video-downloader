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
  for (const path of ['/video-trimmer', '/video-merger', '/audio-extractor', '/video-to-gif', '/image-converter', '/image-compressor', '/image-resizer']) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
  await page.goto('/image-converter');
  await page.locator('input[type=file]').setInputFiles('public/assets/blog/download-youtube-videos.webp');
  await page.getByRole('button', { name: 'Convert locally' }).click();
  const result = page.getByRole('link', { name: 'Save converted.png' });
  await expect(result).toBeVisible();
  await expect(result).toHaveAttribute('href', /^blob:/);
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
