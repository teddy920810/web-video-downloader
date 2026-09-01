import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSecret, getSession, getCreditService } = vi.hoisted(() => ({
  getSecret: vi.fn(),
  getSession: vi.fn(),
  getCreditService: vi.fn(),
}));

vi.mock('astro:env/server', () => ({ getSecret }));
vi.mock('../../../lib/auth', () => ({ getSession }));
vi.mock('../../../lib/credits/services', () => ({ getCreditService }));

import { POST } from './test-credits';

function context(body: unknown) {
  return { request: new Request('https://example.test/api/admin/test-credits', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) } as Parameters<typeof POST>[0];
}

describe('POST /api/admin/test-credits', () => {
  const grantTestCredits = vi.fn();

  beforeEach(() => {
    getSession.mockResolvedValue({ user: { id: 'google-user-1', email: 'owner@example.com' } });
    getSecret.mockImplementation((name: string) => name === 'ADMIN_EMAILS' ? 'owner@example.com' : undefined);
    grantTestCredits.mockReset().mockResolvedValue({ freeCredits: 2, paidCredits: 0 });
    getCreditService.mockReturnValue({ grantTestCredits });
  });

  it('fails closed for a signed-in account outside the administrator allowlist', async () => {
    getSecret.mockReturnValue('another@example.com');
    const response = await POST(context({ idempotencyKey: crypto.randomUUID() }));
    expect(response.status).toBe(404);
    expect(grantTestCredits).not.toHaveBeenCalled();
  });

  it('adds exactly one free test credit to the current administrator account', async () => {
    const idempotencyKey = crypto.randomUUID();
    const response = await POST(context({ idempotencyKey }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ freeCredits: 2, paidCredits: 0 });
    expect(grantTestCredits).toHaveBeenCalledWith('google-user-1', 1, idempotencyKey);
  });

  it('rejects a malformed idempotency key', async () => {
    const response = await POST(context({ idempotencyKey: 'repeat-me' }));
    expect(response.status).toBe(400);
    expect(grantTestCredits).not.toHaveBeenCalled();
  });
});
