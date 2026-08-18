import { describe, expect, it } from 'vitest';
import { POST } from './check';

function context(body: unknown) {
  return { request: new Request('https://example.test/api/downloads/check', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) } as Parameters<typeof POST>[0];
}

describe('POST /api/downloads/check', () => {
  it('allows a supported link before sign-in', async () => {
    const response = await POST(context({ url: 'https://www.youtube.com/watch?v=abc123' }));
    await expect(response.json()).resolves.toEqual({ platform: 'youtube', url: 'https://www.youtube.com/watch?v=abc123' });
  });
});
