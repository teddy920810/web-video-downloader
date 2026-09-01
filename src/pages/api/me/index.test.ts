import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, getCreditService, getSecret } = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCreditService: vi.fn(),
  getSecret: vi.fn(),
}));
vi.mock('../../../lib/auth', () => ({ getSession }));
vi.mock('../../../lib/credits/services', () => ({ getCreditService }));
vi.mock('astro:env/server', () => ({ getSecret }));

import { GET } from './index';

const context = { request: new Request('https://example.test/api/me') } as Parameters<typeof GET>[0];

describe('GET /api/me', () => {
  beforeEach(() => {
    getSecret.mockReturnValue('person@example.com');
    getSession.mockResolvedValue({ user: { id: 'user-1', email: 'person@example.com', name: 'Person', image: null } });
    getCreditService.mockReturnValue({
      getOrCreateAccount: vi.fn().mockResolvedValue({ userId: 'user-1', email: 'person@example.com', planId: 'free', status: 'active', freeCredits: 1, paidCredits: 0 }),
      listUsage: vi.fn().mockResolvedValue([]),
    });
  });

  it('requires a signed-in account', async () => {
    getSession.mockResolvedValue(null);
    expect((await GET(context)).status).toBe(401);
  });

  it('returns the plan, wallet, and recent usage', async () => {
    const response = await GET(context);
    await expect(response.json()).resolves.toMatchObject({ account: { planId: 'free', freeCredits: 1 }, usage: [], canGrantTestCredits: true });
  });
});
