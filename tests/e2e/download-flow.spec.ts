import { expect, test } from '@playwright/test';

const sourceUrl = 'https://www.youtube.com/watch?v=example';

async function waitForDownloaderHydration(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => {
    const input = document.querySelector('#video-url');
    const island = input?.closest('astro-island');
    return island != null && !island.hasAttribute('ssr');
  });
}

test('analyzes and prepares a signed download for a signed-in user', async ({ page }) => {
  await page.route('**/api/auth/get-session', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ user: { id: 'google-user-1', name: 'Test User', email: 'test@example.com' }, session: { id: 'session-1' } }),
  }));
  await page.route('**/api/downloads/check', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ platform: 'youtube', url: sourceUrl }) }));
  await page.route('**/api/downloads/inspect', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ platform: 'youtube', sourceUrl, title: 'Test video', thumbnail: null, durationSeconds: 30, formats: [{ formatId: '18', label: '360p', container: 'mp4', height: 360, hasAudio: true, estimatedSizeBytes: 1_024 }] }),
  }));
  await page.route('**/api/downloads', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ downloadUrl: 'https://download.example.test/signed', sizeBytes: 1_024 }) }));

  await page.goto('/');
  await waitForDownloaderHydration(page);
  await page.locator('#video-url').fill(sourceUrl);
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze available formats' }).click();
  await page.getByRole('button', { name: 'Download 360p · MP4' }).click();

  await expect(page.getByRole('link', { name: 'Download your file' })).toHaveAttribute('href', 'https://download.example.test/signed');
});

test('keeps link checking anonymous and asks for Google sign-in before real analysis', async ({ page }) => {
  await page.route('**/api/auth/get-session', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
  await page.route('**/api/downloads/check', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ platform: 'youtube', url: sourceUrl }) }));

  await page.goto('/');
  await waitForDownloaderHydration(page);
  await page.locator('#video-url').fill(sourceUrl);
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Sign in to analyze formats' })).toBeVisible();
});
