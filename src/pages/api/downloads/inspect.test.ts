import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSecret } = vi.hoisted(() => ({ getSecret: vi.fn() }));
vi.mock('astro:env/server', () => ({ getSecret }));
import { POST } from './inspect';

function context(body: unknown) {
  return { request: new Request('https://example.test/api/downloads/inspect', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) } as Parameters<typeof POST>[0];
}

describe('POST /api/downloads/inspect', () => {
  beforeEach(() => {
    getSecret.mockReturnValue('http://download-service.test');
    vi.stubGlobal('fetch', vi.fn());
  });

  it('passes a valid link to the private parsing service without requiring sign-in', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ platform: 'youtube', title: 'Video', durationSeconds: 30, formats: [] }), { status: 200 }));
    const response = await POST(context({ url: 'https://www.youtube.com/watch?v=abc123' }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ platform: 'youtube', title: 'Video' });
    expect(fetch).toHaveBeenCalledOnce();
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toBe('http://download-service.test/v1/inspect');
  });

  it('passes other public HTTPS links to provider inspection', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ platform: 'other', title: 'Video', durationSeconds: 30, formats: [] }), { status: 200 }));
    const response = await POST(context({ url: 'https://example.com/video.mp4' }));
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
