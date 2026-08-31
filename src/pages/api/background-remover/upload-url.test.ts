import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, createUploadUrl, getServices } = vi.hoisted(() => ({
  getSession: vi.fn(),
  createUploadUrl: vi.fn(),
  getServices: vi.fn(),
}));

vi.mock('../../../lib/auth', () => ({ getSession }));
vi.mock('../../../lib/services', () => ({ getServices }));

import { POST } from './upload-url';

function context(body: unknown) {
  return { request: new Request('https://example.test/api/background-remover/upload-url', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) } as Parameters<typeof POST>[0];
}

describe('POST /api/background-remover/upload-url', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ user: { id: 'google-user-1', email: 'person@example.com' } });
    createUploadUrl.mockResolvedValue('https://private-upload.example.test');
    getServices.mockReturnValue({ objects: { createUploadUrl } });
  });

  it('requires Google sign-in before creating a private upload', async () => {
    getSession.mockResolvedValue(null);
    expect((await POST(context({ contentType: 'image/png', size: 42 }))).status).toBe(401);
    expect(createUploadUrl).not.toHaveBeenCalled();
  });

  it('returns a job-bound private R2 upload URL', async () => {
    const response = await POST(context({ contentType: 'image/png', size: 42 }));
    const result = await response.json() as { jobId: string; inputKey: string; uploadUrl: string };

    expect(response.status).toBe(200);
    expect(result.jobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.inputKey).toBe(`tool-inputs/background-remover/${result.jobId}.png`);
    expect(result.uploadUrl).toBe('https://private-upload.example.test');
    expect(createUploadUrl).toHaveBeenCalledWith(result.inputKey, 'image/png');
  });

  it('rejects unsupported or oversized images before creating a URL', async () => {
    expect((await POST(context({ contentType: 'image/svg+xml', size: 42 }))).status).toBe(400);
    expect((await POST(context({ contentType: 'image/png', size: 20 * 1024 * 1024 }))).status).toBe(400);
    expect(createUploadUrl).not.toHaveBeenCalled();
  });
});
