import { expect, test } from '@playwright/test';

const sourceUrl = 'https://www.youtube.com/watch?v=example';

async function waitForDownloaderHydration(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => {
    const input = document.querySelector('#video-url');
    const island = input?.closest('astro-island');
    return island != null && !island.hasAttribute('ssr');
  });
}

test('analyzes immediately, lists resources, and prepares an eligible web download', async ({ page }) => {
  await page.route('**/api/auth/get-session', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ user: { id: 'google-user-1', name: 'Test User', email: 'test@example.com' }, session: { id: 'session-1' } }),
  }));
  await page.route('**/api/downloads/inspect', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ platform: 'youtube', sourceUrl, title: 'Test video', thumbnail: null, durationSeconds: 30, formats: [
      { formatId: '137', label: '1080p', container: 'mp4', height: 1080, hasVideo: true, hasAudio: false, audioBitrateKbps: null, estimatedSizeBytes: 8_192 },
      { formatId: '18', label: '360p', container: 'mp4', height: 360, hasVideo: true, hasAudio: true, audioBitrateKbps: null, estimatedSizeBytes: 1_024 },
    ] }),
  }));
  await page.route('**/api/downloads', (route) => route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ jobId: '2d05763e-faa5-495f-979f-8852b16ea0c1', status: 'queued' }) }));
  await page.route('**/api/downloads/2d05763e-faa5-495f-979f-8852b16ea0c1', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ready', downloadUrl: 'https://download.example.test/signed', sizeBytes: 1_024 }) }));

  await page.goto('/');
  await waitForDownloaderHydration(page);
  await page.locator('#video-url').fill(sourceUrl);
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Available downloads' })).toBeVisible();
  await expect(page.getByText('1080p')).toBeVisible();
  await page.getByRole('button', { name: 'Download 360p MP4' }).click();

  await expect(page.getByRole('link', { name: 'Download your file' })).toHaveAttribute('href', 'https://download.example.test/signed');
});

test('keeps format inspection anonymous and asks for Google sign-in only for an eligible download', async ({ page }) => {
  await page.route('**/api/auth/get-session', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
  await page.route('**/api/downloads/inspect', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ platform: 'youtube', sourceUrl, title: 'Test video', thumbnail: null, durationSeconds: 30, formats: [{ formatId: '18', label: '360p', container: 'mp4', height: 360, hasVideo: true, hasAudio: true, audioBitrateKbps: null, estimatedSizeBytes: 1_024 }] }) }));

  await page.goto('/');
  await waitForDownloaderHydration(page);
  await page.locator('#video-url').fill(sourceUrl);
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Available downloads' })).toBeVisible();
  await page.getByRole('button', { name: 'Download 360p MP4' }).click();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
});

test('shows the desktop coming-soon modal for a format above 720p', async ({ page }) => {
  await page.route('**/api/auth/get-session', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
  await page.route('**/api/downloads/inspect', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ platform: 'youtube', sourceUrl, title: 'Test video', thumbnail: null, durationSeconds: 30, formats: [{ formatId: '137', label: '1080p', container: 'mp4', height: 1080, hasVideo: true, hasAudio: false, audioBitrateKbps: null, estimatedSizeBytes: null }] }) }));

  await page.goto('/');
  await waitForDownloaderHydration(page);
  await page.locator('#video-url').fill(sourceUrl);
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();
  await page.getByRole('button', { name: 'Download 1080p MP4' }).click();

  await expect(page.getByRole('dialog', { name: 'Desktop app coming soon' })).toBeVisible();
});
