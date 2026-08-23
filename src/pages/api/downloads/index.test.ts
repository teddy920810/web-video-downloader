import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSecret, getSession, createTrial, markTrialFailed } = vi.hoisted(() => ({
  getSecret: vi.fn(),
  getSession: vi.fn(),
  createTrial: vi.fn(),
  markTrialFailed: vi.fn(),
}));

vi.mock('astro:env/server', () => ({ getSecret }));
vi.mock('../../../lib/auth', () => ({ getSession }));
vi.mock('../../../lib/trials/trial-store', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../lib/trials/trial-store')>();
  return { ...original, createTrial, markTrialFailed };
});

import { TrialAlreadyUsedError } from '../../../lib/trials/trial-store';
import { POST } from './index';

function context(body: unknown) {
  return { request: new Request('https://example.test/api/downloads', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) } as Parameters<typeof POST>[0];
}

const requestBody = { url: 'https://www.youtube.com/watch?v=abc123', formatId: '18' };
const inspection = {
  sourceUrl: requestBody.url,
  title: 'Example video',
  durationSeconds: 30,
  formats: [{ formatId: '18', height: 360, hasAudio: true }],
};

describe('POST /api/downloads', () => {
  beforeEach(() => {
    createTrial.mockClear();
    markTrialFailed.mockClear();
    getSession.mockResolvedValue({ user: { id: 'google-user-1', email: 'person@example.com' } });
    getSecret.mockImplementation((name: string) => name === 'DOWNLOAD_SERVICE_URL' ? 'http://download-service.test' : 'private-token');
    createTrial.mockResolvedValue({ id: 'trial-1' });
    markTrialFailed.mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(inspection), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ jobId: 'trial-1', status: 'queued' }), { status: 202 })));
  });

  it('requires a Google account with an email address', async () => {
    getSession.mockResolvedValue(null);
    const response = await POST(context(requestBody));
    expect(response.status).toBe(401);
  });

  it('validates the selected format and source URL', async () => {
    expect((await POST(context({ url: requestBody.url }))).status).toBe(400);
    expect((await POST(context({ ...requestBody, url: 'https://localhost/video' }))).status).toBe(400);
  });

  it('requires the private download service configuration', async () => {
    getSecret.mockReturnValue(undefined);
    expect((await POST(context(requestBody))).status).toBe(503);
  });

  it('rejects a format that is not an audio-ready inspected option', async () => {
    vi.mocked(fetch).mockReset().mockResolvedValue(new Response(JSON.stringify({ ...inspection, formats: [] }), { status: 200 }));
    const response = await POST(context(requestBody));
    expect(response.status).toBe(400);
  });

  it.each([
    { durationSeconds: 601, formats: inspection.formats },
    { durationSeconds: 30, formats: [{ formatId: '18', height: 1080, hasAudio: true }] },
  ])('does not reserve a web trial for a desktop-only selection', async (outsidePolicy) => {
    vi.mocked(fetch).mockReset().mockResolvedValue(new Response(JSON.stringify({ ...inspection, ...outsidePolicy }), { status: 200 }));

    const response = await POST(context(requestBody));

    expect(response.status).toBe(400);
    expect(createTrial).not.toHaveBeenCalled();
  });

  it('enforces one completed trial per account', async () => {
    createTrial.mockRejectedValue(new TrialAlreadyUsedError());
    const response = await POST(context(requestBody));
    expect(response.status).toBe(409);
  });

  it('creates the trial and returns a queued job without waiting for the file', async () => {
    const response = await POST(context(requestBody));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ jobId: 'trial-1', status: 'queued' });
  });

  it('marks a reserved trial failed when preparation fails', async () => {
    vi.mocked(fetch).mockReset()
      .mockResolvedValueOnce(new Response(JSON.stringify(inspection), { status: 200 }))
      .mockResolvedValue(new Response(JSON.stringify({ detail: 'source unavailable' }), { status: 502 }));
    const response = await POST(context(requestBody));
    expect(response.status).toBe(502);
    expect(markTrialFailed).toHaveBeenCalledWith('trial-1', 'source unavailable');
  });
});
