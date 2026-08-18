import { describe, expect, it } from 'vitest';
import { inspectDownloadUrl } from './policy';

describe('inspectDownloadUrl', () => {
  it.each([
    'https://www.youtube.com/watch?v=abc123',
    'https://youtu.be/abc123',
    'https://www.tiktok.com/@creator/video/123',
    'https://www.instagram.com/reel/abc123/',
  ])('allows an individual video from a supported platform: %s', (url) => {
    expect(inspectDownloadUrl(url)).toMatchObject({ ok: true });
  });

  it('rejects unsupported platforms', () => {
    expect(inspectDownloadUrl('https://example.com/video.mp4')).toEqual({
      ok: false,
      message: 'This platform is not supported yet.',
    });
  });

  it('rejects non-HTTPS URLs', () => {
    expect(inspectDownloadUrl('http://www.youtube.com/watch?v=abc123')).toEqual({
      ok: false,
      message: 'Please enter a valid HTTPS URL.',
    });
  });

  it('rejects YouTube playlists', () => {
    expect(inspectDownloadUrl('https://www.youtube.com/watch?v=abc123&list=PL123')).toEqual({
      ok: false,
      message: 'Playlists are not available in the free trial.',
    });
  });
});
