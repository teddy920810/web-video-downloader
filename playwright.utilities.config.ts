import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'utilities-mode.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'line',
  use: {
    baseURL: 'http://127.0.0.1:4392',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'utilities-chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node ./node_modules/astro/bin/astro.mjs dev --host 127.0.0.1 --port 4392',
    url: 'http://127.0.0.1:4392',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      SITE_URL: 'http://127.0.0.1:4392',
      SITE_MODE: 'utilities',
      ASTRO_DEV_BACKGROUND: '1',
    },
  },
});
