import { beforeEach, describe, expect, it, vi } from 'vitest';
const { getSecret, sql, neon } = vi.hoisted(() => { const sql = Object.assign(vi.fn(), { transaction: vi.fn() }); return { getSecret: vi.fn(), sql, neon: vi.fn(() => sql) }; });
vi.mock('astro:env/server', () => ({ getSecret }));
vi.mock('@neondatabase/serverless', () => ({ neon }));
import { accountStore } from './store';
describe('account database adapter', () => {
  beforeEach(() => { getSecret.mockReturnValue('postgres://test'); sql.mockReset().mockResolvedValue([]); sql.transaction.mockReset(); });
  it('defaults missing preferences without opting into marketing', async () => {
    sql.transaction.mockResolvedValue([[], [], [], []]);
    expect(await accountStore.details('one')).toMatchObject({ preferences: { nickname: '', marketingOptIn: false }, reservedCredits: 0 });
    sql.transaction.mockResolvedValue([[{ nickname: 'Two', marketingOptIn: true }], [{ id: '1' }], [{ total: 2 }], []]);
    expect(await accountStore.details('two')).toMatchObject({ preferences: { nickname: 'Two' }, reservedCredits: 2 });
  });
  it('stores explicit profile choices as bound parameters', async () => {
    await accountStore.profile('one', { nickname: "' SQL", marketingOptIn: false });
    expect(sql.mock.calls[0].slice(1)).toEqual(['one', "' SQL", false]);
  });
  it('hashes redemption codes and handles missing wallets', async () => {
    expect(await accountStore.redeem('one', 'A'.repeat(32))).toEqual({ outcome: 'unavailable', awarded: 0 });
    expect(sql.mock.calls[0][2]).toMatch(/^[a-f0-9]{64}$/);
    sql.mockResolvedValue([{ outcome: 'redeemed', awarded: 3 }]);
    expect(await accountStore.redeem('one', 'A'.repeat(32))).toEqual({ outcome: 'redeemed', awarded: 3 });
  });
  it('shows a generated code only for a newly inserted record', async () => {
    const input = { label: 'QA', credits: 1, maxUses: 1, expiresAt: new Date().toISOString(), requestId: crypto.randomUUID() };
    sql.mockResolvedValue([{ id: input.requestId }]);
    const result = await accountStore.createCode('one', input);
    expect(result.code).toMatch(/^[A-F0-9]{32}$/);
    expect(sql.mock.calls[0]).not.toContain(result.code);
    sql.mockResolvedValue([]);
    expect((await accountStore.createCode('one', input)).code).toBeNull();
  });
  it('lists audits without code hashes and disables existing records', async () => {
    sql.transaction.mockResolvedValue([[{ id: 'code' }], []]);
    expect(await accountStore.codes()).toEqual({ codes: [{ id: 'code' }], redemptions: [] });
    expect(await accountStore.disableCode('code')).toBe(false);
    sql.mockResolvedValue([{ id: 'code' }]);
    expect(await accountStore.disableCode('code')).toBe(true);
  });
  it('fails closed without database configuration', async () => { getSecret.mockReturnValue(undefined); await expect(accountStore.details('one')).rejects.toThrow('unavailable'); });
});
