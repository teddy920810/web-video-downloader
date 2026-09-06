import type { Page } from '@playwright/test';

// Preserve window.location.hostname for the consent tests without depending
// on OS DNS, proxy settings, or Chromium host-resolver flags.
export async function serveProductionHostLocally(page: Page) {
  await page.route('http://www.streamnest.io:4391/**', async (route) => {
    const url = new URL(route.request().url());
    const host = url.host;
    url.hostname = '127.0.0.1';
    // Preserve Astro.url.hostname too: SSR only emits GA for the canonical host.
    const response = await route.fetch({ url: url.toString(), headers: { ...route.request().headers(), host } });
    await route.fulfill({ response });
  });
}
