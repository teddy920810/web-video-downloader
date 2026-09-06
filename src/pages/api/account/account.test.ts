import { beforeEach, describe, expect, it, vi } from 'vitest';
const { getSession, getSecret, getCreditService, accountStore } = vi.hoisted(() => ({
  getSession: vi.fn(), getSecret: vi.fn(), getCreditService: vi.fn(),
  accountStore: { details: vi.fn(), profile: vi.fn(), redeem: vi.fn(), codes: vi.fn(), createCode: vi.fn(), disableCode: vi.fn() },
}));
vi.mock('../../../lib/auth', () => ({ getSession }));
vi.mock('astro:env/server', () => ({ getSecret }));
vi.mock('../../../lib/credits/services', () => ({ getCreditService }));
vi.mock('../../../lib/account/store', () => ({ accountStore }));
import { ALL } from './[action]';
const user = { id: 'user-1', email: 'user@example.test', name: 'User' };
function context(action = 'overview', method = 'GET', body?: unknown, headers?: Record<string, string>) {
  return { params: { action }, request: new Request(`https://example.test/api/account/${action}`, {
    method, headers: { origin: 'https://example.test', 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
  }) } as unknown as Parameters<typeof ALL>[0];
}
describe('account API isolation', () => {
  beforeEach(() => {
    vi.resetAllMocks(); getSession.mockResolvedValue({ user }); getSecret.mockReturnValue('admin@example.test');
    getCreditService.mockReturnValue({ getOrCreateAccount: vi.fn().mockResolvedValue({ userId: user.id }), listUsage: vi.fn().mockResolvedValue([]) });
    accountStore.details.mockResolvedValue({ preferences: { nickname: '', marketingOptIn: false }, ledger: [] });
    accountStore.redeem.mockResolvedValue({ outcome: 'redeemed', awarded: 1 });
  });
  it('rejects unauthenticated requests', async () => {
    getSession.mockResolvedValue(null);
    expect((await ALL(context())).status).toBe(401);
    expect(accountStore.details).not.toHaveBeenCalled();
  });
  it('returns only the current user and disables caching', async () => {
    const response = await ALL(context());
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ canGrantTestCredits: false, account: { userId: user.id } });
    expect(accountStore.details).toHaveBeenCalledWith(user.id);
  });
  it('requires same-origin JSON and bounded bodies', async () => {
    expect((await ALL(context('profile', 'POST', {}, { origin: 'https://evil.test' }))).status).toBe(403);
    expect((await ALL(context('profile', 'POST', {}, { 'content-type': 'text/plain' }))).status).toBe(403);
    expect((await ALL(context('profile', 'POST', { x: 'a'.repeat(5000) }))).status).toBe(413);
    expect(accountStore.profile).not.toHaveBeenCalled();
  });
  it('does not accept another user identity or a forged balance', async () => {
    expect((await ALL(context('profile', 'POST', { nickname: 'Joe', marketingOptIn: false, userId: 'other' }))).status).toBe(400);
    expect((await ALL(context('redeem', 'POST', { code: 'A'.repeat(32), credits: 100 }))).status).toBe(400);
    expect(accountStore.redeem).not.toHaveBeenCalled();
  });
  it('persists preferences for the session owner', async () => {
    expect((await ALL(context('profile', 'POST', { nickname: ' Joe ', marketingOptIn: false }))).status).toBe(200);
    expect(accountStore.profile).toHaveBeenCalledWith(user.id, { nickname: 'Joe', marketingOptIn: false });
  });
  it('redeems normalized codes and exposes throttling', async () => {
    await ALL(context('redeem', 'POST', { code: 'a'.repeat(32) }));
    expect(accountStore.redeem).toHaveBeenCalledWith(user.id, 'A'.repeat(32));
    accountStore.redeem.mockResolvedValue({ outcome: 'rate_limited', awarded: 0 });
    expect((await ALL(context('redeem', 'POST', { code: 'A'.repeat(32) }))).status).toBe(429);
  });
  it('hides every admin endpoint from ordinary users', async () => {
    for (const [action, method] of [['codes', 'GET'], ['codes', 'POST'], ['disable-code', 'POST']]) {
      expect((await ALL(context(action, method, method === 'POST' ? {} : undefined))).status).toBe(404);
    }
    expect(accountStore.codes).not.toHaveBeenCalled();
    expect(accountStore.createCode).not.toHaveBeenCalled();
  });
  it('allows administrators to list, create and disable codes', async () => {
    getSecret.mockReturnValue(user.email);
    accountStore.codes.mockResolvedValue({ codes: [], redemptions: [] });
    expect((await ALL(context('codes'))).status).toBe(200);
    const input = { label: 'QA', credits: 1, maxUses: 1, expiresAt: new Date(Date.now() + 86400000).toISOString(), requestId: crypto.randomUUID() };
    await ALL(context('codes', 'POST', input));
    expect(accountStore.createCode).toHaveBeenCalledWith(user.id, input);
    accountStore.disableCode.mockResolvedValue(true);
    const response = await ALL(context('disable-code', 'POST', { id: input.requestId }));
    expect(await response.json()).toEqual({ disabled: true });
  });
  it('rejects unsupported paths, methods, missing and malformed JSON', async () => {
    expect((await ALL(context('billing'))).status).toBe(404);
    expect((await ALL(context('profile', 'GET'))).status).toBe(405);
    expect((await ALL(context('profile', 'POST'))).status).toBe(400);
    const input = context('profile', 'POST');
    input.request = new Request(input.request.url, { method: 'POST', headers: input.request.headers, body: '{' });
    expect((await ALL(input)).status).toBe(400);
  });
  it('does not expose provider exceptions or secrets', async () => {
    accountStore.details.mockRejectedValue(new Error('credential secret'));
    const response = await ALL(context());
    expect(response.status).toBe(503); expect(await response.text()).not.toContain('credential');
  });
});
