import { describe, expect, it, vi } from 'vitest';
vi.mock('astro:middleware', () => ({ defineMiddleware: (handler: unknown) => handler }));
vi.mock('./lib/config/site-mode-server', () => ({ getSiteMode: vi.fn() }));
import { createModeMiddleware } from './middleware';

function context(path: string) {
  return {
    request: new Request(`https://example.test${path}`),
    url: new URL(`https://example.test${path}`),
    locals: {},
    rewrite: vi.fn().mockResolvedValue(new Response('<h1>Not found</h1>')),
  };
}

function asResponse(value: void | Response): Response {
  if (!(value instanceof Response)) throw new Error('Middleware did not return a response.');
  return value;
}

describe('site mode middleware', () => {
  it.each(['/api/downloads', '/api/downloads/inspect', '/api/downloads/job-1'])('blocks %s before downstream code in utilities mode', async (path) => {
    const next = vi.fn().mockResolvedValue(new Response('downstream'));
    const response = asResponse(await createModeMiddleware(async () => 'utilities')(context(path) as never, next));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('keeps local utility and legal routes available', async () => {
    const next = vi.fn().mockResolvedValue(new Response('ok'));
    const middleware = createModeMiddleware(async () => 'utilities');
    for (const path of ['/video-converter', '/video-compressor', '/privacy', '/terms']) {
      const response = asResponse(await middleware(context(path) as never, next));
      expect(response.status).toBe(200);
    }
    expect(next).toHaveBeenCalledTimes(4);
  });

  it('keeps existing download routes available in downloader mode', async () => {
    const next = vi.fn().mockResolvedValue(new Response('ok'));
    const response = asResponse(await createModeMiddleware(async () => 'downloader')(context('/api/downloads/inspect') as never, next));

    expect(response.status).toBe(200);
    expect(next).toHaveBeenCalledOnce();
  });

  it.each(['/blog', '/blog/download-youtube-videos'])('renders %s as a real 404 in utilities mode', async (path) => {
    const next = vi.fn();
    const current = context(path);
    const response = asResponse(await createModeMiddleware(async () => 'utilities')(current as never, next));

    expect(response.status).toBe(404);
    expect(current.rewrite).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
  });
});
