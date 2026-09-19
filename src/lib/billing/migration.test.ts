import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const run = (extra: Record<string, string | undefined> = {}, apply = false) =>
  spawnSync(
    process.execPath,
    ['scripts/migrate-billing-test.mjs', ...(apply ? ['--apply'] : [])],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        VERCEL_ENV: 'preview',
        BILLING_TEST_DATABASE_URL: 'postgres://test:secret@isolated.example/db',
        DATABASE_URL: 'postgres://prod:secret@production.example/db',
        ...extra,
      },
    },
  );
describe('safe test database migration command', () => {
  it('does not run production migrations during local builds or previews, even with live configuration', () => {
    for (const environment of ['preview', 'development', '']) {
      const result = spawnSync(process.execPath, ['scripts/migrate-billing-live.mjs', '--production-release'], {
        encoding: 'utf8', env: { ...process.env, VERCEL_ENV: environment, BILLING_MODE: 'live', DATABASE_URL: 'postgres://do-not-connect' },
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('skipped');
    }
  });
  it('prints a plan without connecting or mutating by default', () => {
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('4 migrations');
    expect(result.stdout).not.toContain('secret');
  });
  it('refuses production and a pooled alias of the default database even with --apply', () => {
    for (const extra of [
      { VERCEL_ENV: 'production' },
      {
        BILLING_TEST_DATABASE_URL:
          'postgres://test:secret@production-pooler.example/db',
      },
      { BILLING_TEST_DATABASE_URL: '' },
    ]) {
      const result = run(extra, true);
      expect(result.status).toBe(1);
      expect(result.stderr).not.toContain('postgres://');
      expect(result.stderr).not.toContain('secret@');
    }
  });
});
