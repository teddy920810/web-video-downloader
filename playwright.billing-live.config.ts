import { defineConfig } from '@playwright/test';
import base from './playwright.billing.config';
const server = base.webServer as Exclude<typeof base.webServer, unknown[] | undefined>;
export default defineConfig({
  ...base,
  testMatch: 'billing-live.spec.ts',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4394' },
  webServer: {
    ...server,
    command: 'node ./node_modules/astro/bin/astro.mjs dev --ignore-lock --host 127.0.0.1 --port 4394',
    url: 'http://127.0.0.1:4394',
    env: { ...server.env, SITE_URL: 'http://127.0.0.1:4394', BILLING_MODE: 'live', VERCEL_ENV: 'production',
      CREEM_API_KEY: 'creem_live_browser_fixture', BILLING_CHECKOUT_ACCESS: 'validation', BILLING_VALIDATION_EMAILS: 'fixture@example.test',
      DATABASE_URL: 'postgres://fixture:fixture@127.0.0.1:1/live-fixture', BILLING_TEST_DATABASE_URL: '',
    },
  },
});
