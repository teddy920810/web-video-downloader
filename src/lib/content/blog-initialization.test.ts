import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const blogDirectory = resolve(process.cwd(), 'src/content/blog');

describe('download guide initialization', () => {
  it('initializes every direct download topic found in the reference sitemap', () => {
    const posts = readdirSync(blogDirectory).filter((file) => file.endsWith('.md'));

    expect(posts).toEqual(expect.arrayContaining([
      'download-youtube-videos.md',
      'download-naver-videos.md',
      'watch-hulu-offline.md',
      'watch-disney-plus-offline.md',
      'download-gimy-videos.md',
      'watch-crunchyroll-offline.md',
      'watch-netflix-offline.md',
      'save-youtube-live-streams.md',
      'download-instagram-videos.md',
      'download-youtube-playlists.md',
      'download-multiple-videos.md',
      'download-videos-from-websites.md',
    ]));
  });

  it('keeps imported topics original, lawful, and honest about product support', () => {
    const posts = readdirSync(blogDirectory)
      .filter((file) => file.endsWith('.md'))
      .map((file) => readFileSync(resolve(blogDirectory, file), 'utf8'));
    const corpus = posts.join('\n');

    expect(corpus).not.toMatch(/vcows|10,?000\+\s*sites/i);
    expect(corpus).toMatch(/only download content you own or have permission to save/i);
    expect(corpus).toMatch(/official offline download/i);
    expect(corpus).toMatch(/currently supports YouTube, TikTok, and Instagram/i);
  });

  it('presents the shared collection as neutral Streamnest guidance', () => {
    const settings = JSON.parse(readFileSync(resolve(process.cwd(), 'src/content/settings/blog.json'), 'utf8')) as {
      title: string;
      description: string;
      shareImage: string;
      eyebrow: string;
      heading: string;
      intro: string;
    };
    const visibleCopy = `${settings.title} ${settings.description} ${settings.eyebrow} ${settings.heading} ${settings.intro}`;

    expect(visibleCopy).toMatch(/streamnest|video/i);
    expect(visibleCopy).not.toMatch(/download(er|ing)?/i);
    expect(visibleCopy).not.toMatch(/watermark|image cleanup/i);
    expect(settings.shareImage).toBe('/brand-og-card.svg');
  });

  it('makes the initialized blog discoverable from the primary navigation', () => {
    const settings = JSON.parse(readFileSync(resolve(process.cwd(), 'src/content/settings/site.json'), 'utf8')) as {
      header: { navigation: Array<{ label: string; href: string }> };
    };

    expect(settings.header.navigation).toContainEqual({ label: 'Guides', href: '/blog' });
  });
});
