import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'billing-flow.spec.ts',
  workers: 1,
  expect: { timeout: 15000 },
  use: {
    baseURL: 'http://127.0.0.1:4393',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'billing-chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command:
      'node ./node_modules/astro/bin/astro.mjs dev --ignore-lock --host 127.0.0.1 --port 4393',
    url: 'http://127.0.0.1:4393',
    reuseExistingServer: false,
    timeout: 120000,
    // Browser tests mock billing/account requests; these are nonworking fixture credentials.
    env: {
      SITE_URL: 'http://127.0.0.1:4393',
      SITE_MODE: 'utilities',
      ASTRO_DEV_BACKGROUND: '1',
      BILLING_MODE: 'test',
      VERCEL_ENV: 'preview',
      CREEM_API_KEY: 'creem_test_browser_fixture',
      CREEM_WEBHOOK_SECRET: 'browser-fixture-only',
      BILLING_TEST_DATABASE_URL:
        'postgres://fixture:fixture@127.0.0.1:1/browser-fixture',
      CREEM_PRODUCT_IDS:
        '{"pro-monthly-500":"prod_pro","pack-300":"prod_pack","pack-1000":"prod_pack1000","pack-2000":"prod_pack2000","pack-10000":"prod_pack10000"}',
    },
  },
});
