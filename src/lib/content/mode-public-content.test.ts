import { describe, expect, it } from 'vitest';
import { buildRobotsText, filterPostsForMode, isPostVisibleInMode, utilityLegalPages } from './mode-public-content';

describe('mode-specific public content', () => {
  const site = new URL('https://www.streamnest.io');

  it('keeps downloader discovery available in downloader mode', () => {
    const text = buildRobotsText('downloader', site);
    expect(text).toContain('Allow: /');
    expect(text).not.toContain('Disallow: /blog');
  });

  it('prevents crawlers from discovering hidden downloader surfaces in utilities mode', () => {
    const text = buildRobotsText('utilities', site);
    expect(text).toContain('Disallow: /api/');
    expect(text).not.toContain('Disallow: /blog');
    expect(text).toContain('Sitemap: https://www.streamnest.io/sitemap.xml');
  });

  it('keeps non-download blog content visible in utilities mode', () => {
    const posts = [
      { data: { productArea: 'downloader' as const } },
      { data: { productArea: 'converter' as const } },
      { data: { productArea: 'compressor' as const } },
      { data: { productArea: 'general' as const } },
    ];
    expect(filterPostsForMode(posts, 'utilities')).toEqual(posts.slice(1));
    expect(filterPostsForMode(posts, 'downloader')).toEqual(posts);
    expect(isPostVisibleInMode({ productArea: 'downloader' }, 'utilities')).toBe(false);
  });

  it('describes only local processing in utilities legal content', () => {
    const rendered = Object.values(utilityLegalPages).map((page) => JSON.stringify(page)).join(' ');
    expect(rendered).toContain('stays on your device');
    expect(rendered).toContain('Google sign-in');
    expect(rendered).not.toMatch(/YouTube|TikTok|Instagram|Cloud Run|Cloudflare R2|free successful download/i);
  });
});
