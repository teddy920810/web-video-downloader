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
});
