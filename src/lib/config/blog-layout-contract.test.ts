import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readProjectFile = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

describe('blog layout contract', () => {
  it('builds CMS-backed blog listing and article routes', () => {
    const indexPage = readProjectFile('src/pages/blog/index.astro');
    const articlePage = readProjectFile('src/pages/blog/[slug].astro');

    expect(indexPage).toContain("getCollection('blog'");
    expect(indexPage).toContain('!data.draft');
    expect(articlePage).toContain('article-layout-grid');
    expect(articlePage).toContain('article-toc-card');
    expect(articlePage).toContain('article-related-card');
    expect(articlePage).toContain('buildArticleSchema');
    expect(articlePage).toContain('<Content />');
    expect(articlePage).toContain('set:html={post.data.bodyHtml}');
    expect(articlePage.indexOf('<header class="article-page-header">'))
      .toBeLessThan(articlePage.indexOf('<nav class="article-breadcrumbs"'));
  });

  it('uses the reference layout without copying the reference brand or article', () => {
    const articlePage = readProjectFile('src/pages/blog/[slug].astro');
    const css = readProjectFile('src/styles/global.css');

    expect(css).toContain('grid-template-columns: 192px minmax(0, 720px) 240px');
    expect(css).toContain('.article-toc-card');
    expect(css).toContain('.article-related-card');
    expect(css).toMatch(/\.article-toc-column\s*\{[^}]*position:\s*sticky/s);
    expect(css).toMatch(/\.article-related-column\s*\{[^}]*position:\s*sticky/s);
    expect(css).toContain('@media (max-width: 1100px)');
    expect(`${articlePage}\n${css}`).not.toMatch(/ifonetool|y2mate/i);
  });

  it('shares the downloader theme and exposes accessible category filters', () => {
    const indexPage = readProjectFile('src/pages/blog/index.astro');
    const articlePage = readProjectFile('src/pages/blog/[slug].astro');
    const layout = readProjectFile('src/layouts/SiteLayout.astro');
    const css = readProjectFile('src/styles/global.css');

    expect(layout).toContain("Astro.url.pathname.startsWith('/blog')");
    expect(indexPage).toContain('data-blog-filter');
    expect(indexPage).toContain('aria-pressed');
    expect(indexPage).toContain('data-blog-card');
    expect(indexPage).toContain('data-blog-results');
    expect(indexPage).toContain('URLSearchParams');
    expect(articlePage).toContain('<SiteLayout');
    expect(css).toContain('.download-site .blog-hero');
    expect(css).toContain('.blog-filter[aria-pressed="true"]');
  });

  it('gives every initialized guide an original cover slot and descriptive alt text', () => {
    const blogFiles = [
      'download-gimy-videos.md',
      'download-instagram-videos.md',
      'download-multiple-videos.md',
      'download-naver-videos.md',
      'download-videos-from-websites.md',
      'download-youtube-playlists.md',
      'download-youtube-videos.md',
      'save-youtube-live-streams.md',
      'watch-crunchyroll-offline.md',
      'watch-disney-plus-offline.md',
      'watch-hulu-offline.md',
      'watch-netflix-offline.md',
    ];

    for (const file of blogFiles) {
      const content = readProjectFile(`src/content/blog/${file}`);
      expect(content).toMatch(/\r?\ncoverImage: \/assets\/blog\/[a-z0-9-]+\.webp\r?\n/);
      expect(content).toMatch(/\r?\ncoverAlt: .+\r?\n/);
    }
  });
});
