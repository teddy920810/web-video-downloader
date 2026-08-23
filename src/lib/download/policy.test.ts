import { describe, expect, it } from 'vitest';
import { inspectDownloadUrl, isDesktopOnly } from './policy';

describe('inspectDownloadUrl', () => {
  it.each([
    'https://www.youtube.com/watch?v=abc123',
    'https://youtu.be/abc123',
    'https://www.tiktok.com/@creator/video/123',
    'https://www.instagram.com/reel/abc123/',
  ])('allows an individual video from a supported platform: %s', (url) => {
    expect(inspectDownloadUrl(url)).toMatchObject({ ok: true });
  });

  it('allows other public HTTPS links to reach provider inspection', () => {
    expect(inspectDownloadUrl('https://example.com/video.mp4')).toMatchObject({
      ok: true,
      platform: 'other',
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

describe('isDesktopOnly', () => {
  it('keeps a 720p ten-minute format eligible for the web trial', () => {
    expect(isDesktopOnly({ durationSeconds: 600, height: 720 })).toBe(false);
  });

  it.each([
    { durationSeconds: 601, height: 360 },
    { durationSeconds: 60, height: 1080 },
  ])('routes formats outside the web limits to desktop', (selection) => {
    expect(isDesktopOnly(selection)).toBe(true);
  });
});
