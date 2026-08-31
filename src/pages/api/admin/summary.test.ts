import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, getSecret, query } = vi.hoisted(() => ({ getSession: vi.fn(), getSecret: vi.fn(), query: vi.fn() }));
vi.mock('../../../lib/auth', () => ({ getSession }));
vi.mock('astro:env/server', () => ({ getSecret }));
vi.mock('@neondatabase/serverless', () => ({ neon: () => query }));

import { GET } from './summary';
const context = { request: new Request('https://example.test/api/admin/summary') } as Parameters<typeof GET>[0];

describe('GET /api/admin/summary', () => {
  beforeEach(() => {
    getSession.mockResolvedValue({ user: { email: 'owner@example.com' } });
    getSecret.mockImplementation((name: string) => name === 'ADMIN_EMAILS' ? 'owner@example.com' : 'postgres://configured');
    query.mockResolvedValue([{ accounts: 3, usage30d: 2, credits30d: 2 }]);
  });
  it('fails closed without a configured matching administrator', async () => {
    getSecret.mockReturnValue(undefined);
    expect((await GET(context)).status).toBe(404);
    expect(query).not.toHaveBeenCalled();
  });
  it('returns aggregate data only to an allowlisted account', async () => {
    const response = await GET(context);
    await expect(response.json()).resolves.toEqual({ accounts: 3, usage30d: 2, credits30d: 2 });
  });
});
