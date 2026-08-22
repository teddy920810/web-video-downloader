import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithPolicy } from './service-client';

describe('fetchWithPolicy', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('retries only a limited number of temporary responses', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', request);

    const response = await fetchWithPolicy('https://service.test', {}, { timeoutMs: 100, retries: 1 });

    expect(response.status).toBe(200);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not retry a permanent client response', async () => {
    const request = vi.fn().mockResolvedValue(new Response('{}', { status: 400 }));
    vi.stubGlobal('fetch', request);

    const response = await fetchWithPolicy('https://service.test', {}, { timeoutMs: 100, retries: 2 });

    expect(response.status).toBe(400);
    expect(request).toHaveBeenCalledOnce();
  });

  it('forwards caller cancellation', async () => {
    const request = vi.fn((_input, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    }));
    vi.stubGlobal('fetch', request);
    const controller = new AbortController();
    const pending = fetchWithPolicy('https://service.test', {}, { timeoutMs: 1_000, retries: 2, signal: controller.signal });
    controller.abort(new Error('cancelled'));

    await expect(pending).rejects.toThrow('cancelled');
    expect(request).toHaveBeenCalledOnce();
  });
});
