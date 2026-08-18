import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSecret, getSession } = vi.hoisted(() => ({ getSecret: vi.fn(), getSession: vi.fn() }));
vi.mock('astro:env/server', () => ({ getSecret }));
vi.mock('../../../lib/auth', () => ({ getSession }));
import { POST } from './inspect';

function context(body: unknown) {
  return { request: new Request('https://example.test/api/downloads/inspect', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) } as Parameters<typeof POST>[0];
}

describe('POST /api/downloads/inspect', () => {
  beforeEach(() => {
    getSession.mockResolvedValue({ user: { id: 'google-user-1' } });
    getSecret.mockReturnValue('http://download-service.test');
    vi.stubGlobal('fetch', vi.fn());
  });

  it('requires a signed-in user', async () => {
    getSession.mockResolvedValue(null);
    const response = await POST(context({ url: 'https://www.youtube.com/watch?v=abc123' }));
    expect(response.status).toBe(401);
  });

  it('passes a valid link to the private parsing service', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ platform: 'youtube', title: 'Video', durationSeconds: 30, formats: [] }), { status: 200 }));
    const response = await POST(context({ url: 'https://www.youtube.com/watch?v=abc123' }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ platform: 'youtube', title: 'Video' });
    expect(fetch).toHaveBeenCalledOnce();
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toBe('http://download-service.test/v1/inspect');
  });

  it('does not permit an unsupported URL', async () => {
    const response = await POST(context({ url: 'https://example.com/video.mp4' }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'This platform is not supported yet.' });
  });
});
