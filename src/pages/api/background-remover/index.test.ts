import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSecret, getSession } = vi.hoisted(() => ({
  getSecret: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('astro:env/server', () => ({ getSecret }));
vi.mock('../../../lib/auth', () => ({ getSession }));

import { POST } from './index';

const jobId = 'eb8fa168-c11c-4e54-8c63-137d649ed1db';
const requestBody = {
  jobId,
  inputKey: `tool-inputs/background-remover/${jobId}.png`,
};

function context(body: unknown) {
  return { request: new Request('https://example.test/api/background-remover', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) } as Parameters<typeof POST>[0];
}

describe('POST /api/background-remover', () => {
  beforeEach(() => {
    getSession.mockResolvedValue({ user: { id: 'google-user-1', email: 'person@example.com' } });
    getSecret.mockImplementation((name: string) => name === 'DOWNLOAD_SERVICE_URL'
      ? 'http://media-service.test'
      : 'private-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      jobId,
      status: 'ready',
      downloadUrl: 'https://private-result.example.test',
      sizeBytes: 42,
    }), { status: 200 })));
  });

  it('requires Google sign-in before spending provider credit', async () => {
    getSession.mockResolvedValue(null);
    expect((await POST(context(requestBody))).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects an input key that is not owned by the submitted job', async () => {
    const response = await POST(context({ ...requestBody, jobId: '2d05763e-faa5-495f-979f-8852b16ea0c1' }));
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('calls the private service exactly once and returns the private R2 result', async () => {
    const response = await POST(context(requestBody));
    await expect(response.json()).resolves.toMatchObject({
      jobId,
      status: 'ready',
      downloadUrl: 'https://private-result.example.test',
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toBe('http://media-service.test/v1/background-removals');
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))).toEqual(requestBody);
  });

  it('returns a safe error without exposing provider details', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ detail: 'replicate token rejected' }), { status: 502 }));
    const response = await POST(context(requestBody));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: 'Unable to remove the image background right now.' });
  });
});
