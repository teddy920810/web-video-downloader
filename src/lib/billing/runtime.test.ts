import { beforeEach, describe, expect, it, vi } from 'vitest';
const { getSecret, neon } = vi.hoisted(() => ({
  getSecret: vi.fn(),
  neon: vi.fn(() => ({ query: vi.fn() })),
}));
vi.mock('astro:env/server', () => ({ getSecret }));
vi.mock('@neondatabase/serverless', () => ({ neon }));
import { accountDatabaseUrl, getBilling } from './runtime';
describe('billing database isolation', () => {
  beforeEach(() => vi.resetAllMocks());
  it('uses the existing database with billing disabled', () => {
    getSecret.mockImplementation((key) =>
      key === 'DATABASE_URL' ? 'postgres://normal' : undefined,
    );
    expect(accountDatabaseUrl()).toBe('postgres://normal');
    expect(getBilling()).toBeNull();
  });
  it('requires a separately configured test database and never falls back to production', () => {
    getSecret.mockImplementation((key) =>
      key === 'BILLING_MODE' ? 'test' : undefined,
    );
    expect(() => accountDatabaseUrl()).toThrow();
    expect(neon).not.toHaveBeenCalled();
  });
  it('loads only the isolated test database for both credits and billing', () => {
    getSecret.mockImplementation(
      (key) =>
        (
          ({
            BILLING_MODE: 'test',
            BILLING_TEST_DATABASE_URL: 'postgres://isolated',
            DATABASE_URL: 'postgres://normal',
            CREEM_API_KEY: 'creem_test_example',
            CREEM_WEBHOOK_SECRET: 'secret',
            CREEM_PRODUCT_IDS: '{"pack-300":"prod_pack"}',
          }) as Record<string, string>
        )[key],
    );
    neon.mockReturnValue({ query: vi.fn() });
    expect(accountDatabaseUrl()).toBe('postgres://isolated');
    expect(getBilling()?.config.mode).toBe('test');
    expect(neon).toHaveBeenCalledWith('postgres://isolated');
  });
  it('fails with no account database', () => {
    expect(() => accountDatabaseUrl()).toThrow('unavailable');
  });
});
