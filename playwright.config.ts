import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'line',
  use: {
    baseURL: 'http://127.0.0.1:4391',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node ./node_modules/astro/bin/astro.mjs dev --host 127.0.0.1 --port 4391',
    url: 'http://127.0.0.1:4391',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      SITE_URL: 'http://127.0.0.1:4391',
      ASTRO_DEV_BACKGROUND: '1',
    },
  },
});

