import { describe, expect, it } from 'vitest';
import { buildArticleToc, selectRelatedPosts } from './blog-layout';

describe('blog article layout helpers', () => {
  it('keeps only article section headings in the table of contents', () => {
    expect(buildArticleToc([
      { depth: 1, slug: 'page-title', text: 'Page title' },
      { depth: 2, slug: 'introduction', text: 'Introduction' },
      { depth: 3, slug: 'safety', text: 'Safety notes' },
      { depth: 4, slug: 'detail', text: 'Implementation detail' },
    ])).toEqual([
      { depth: 2, slug: 'introduction', text: 'Introduction' },
      { depth: 3, slug: 'safety', text: 'Safety notes' },
    ]);
  });

  it('prioritizes related published posts without returning the current article', () => {
    const posts = [
      { slug: 'current', data: { category: 'Guides', publishedAt: '2026-08-20', featured: false, draft: false } },
      { slug: 'same-category', data: { category: 'Guides', publishedAt: '2026-08-10', featured: false, draft: false } },
      { slug: 'featured', data: { category: 'News', publishedAt: '2026-08-19', featured: true, draft: false } },
      { slug: 'newest', data: { category: 'News', publishedAt: '2026-08-21', featured: false, draft: false } },
      { slug: 'draft', data: { category: 'Guides', publishedAt: '2026-08-22', featured: true, draft: true } },
    ];

    expect(selectRelatedPosts(posts, { slug: 'current', category: 'Guides' }, 3).map((post) => post.slug))
      .toEqual(['same-category', 'featured', 'newest']);
  });
});
