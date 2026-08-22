export interface ArticleHeading {
  depth: number;
  slug: string;
  text: string;
}

interface RelatedPostCandidate {
  slug: string;
  data: {
    category?: string;
    publishedAt: string;
    featured: boolean;
    draft: boolean;
  };
}

export function buildArticleToc(headings: ArticleHeading[]) {
  return headings.filter((heading) => heading.depth === 2 || heading.depth === 3);
}

export function selectRelatedPosts<T extends RelatedPostCandidate>(
  posts: T[],
  current: { slug: string; category?: string },
  limit = 4,
) {
  return posts
    .filter((post) => !post.data.draft && post.slug !== current.slug)
    .sort((left, right) => {
      const leftCategory = Boolean(current.category && left.data.category === current.category);
      const rightCategory = Boolean(current.category && right.data.category === current.category);
      if (leftCategory !== rightCategory) return leftCategory ? -1 : 1;
      if (left.data.featured !== right.data.featured) return left.data.featured ? -1 : 1;
      const byDate = right.data.publishedAt.localeCompare(left.data.publishedAt);
      return byDate || left.slug.localeCompare(right.slug);
    })
    .slice(0, limit);
}
