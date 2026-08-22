import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSecret, getSession, getTrialForUser, markTrialFailed, markTrialProcessing, markTrialReady } = vi.hoisted(() => ({
  getSecret: vi.fn(), getSession: vi.fn(), getTrialForUser: vi.fn(), markTrialFailed: vi.fn(), markTrialProcessing: vi.fn(), markTrialReady: vi.fn(),
}));
vi.mock('astro:env/server', () => ({ getSecret }));
vi.mock('../../../lib/auth', () => ({ getSession }));
vi.mock('../../../lib/trials/trial-store', () => ({ getTrialForUser, markTrialFailed, markTrialProcessing, markTrialReady }));
import { GET } from './[id]';

const jobId = '2d05763e-faa5-495f-979f-8852b16ea0c1';
function context(id = jobId) {
  return { request: new Request(`https://example.test/api/downloads/${id}`), params: { id } } as unknown as Parameters<typeof GET>[0];
}

describe('GET /api/downloads/:id', () => {
  beforeEach(() => {
    getSession.mockResolvedValue({ user: { id: 'google-user-1' } });
    getTrialForUser.mockResolvedValue({ id: jobId, userId: 'google-user-1', status: 'queued' });
    getSecret.mockImplementation((name: string) => name === 'DOWNLOAD_SERVICE_URL' ? 'http://download-service.test' : 'private-token');
    markTrialFailed.mockResolvedValue(undefined);
    markTrialProcessing.mockResolvedValue(undefined);
    markTrialReady.mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn());
  });

  it('does not reveal another users job', async () => {
    getTrialForUser.mockResolvedValue(null);
    expect((await GET(context())).status).toBe(404);
  });

  it('records processing state while the client polls', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ jobId, status: 'processing' }), { status: 200 }));
    const response = await GET(context());
    expect(response.status).toBe(200);
    expect(markTrialProcessing).toHaveBeenCalledWith(jobId);
  });

  it('records and returns a completed download', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ jobId, status: 'ready', objectKey: `trials/${jobId}/media.mp4`, downloadUrl: 'https://signed.example/media', sizeBytes: 42 }), { status: 200 }));
    const response = await GET(context());
    await expect(response.json()).resolves.toMatchObject({ status: 'ready', downloadUrl: 'https://signed.example/media' });
    expect(markTrialReady).toHaveBeenCalledWith(jobId, `trials/${jobId}/media.mp4`);
  });
});
