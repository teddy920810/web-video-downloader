import type { SiteMode } from '../config/site-mode';
import type { ProductArea } from './blog-entry';

export type { ProductArea } from './blog-entry';

export function isPostVisibleInMode(post: { productArea?: ProductArea }, mode: SiteMode) {
  return mode === 'downloader' || (post.productArea ?? 'downloader') !== 'downloader';
}

export function filterPostsForMode<T extends { data: { productArea?: ProductArea } }>(posts: T[], mode: SiteMode) {
  return posts.filter((post) => isPostVisibleInMode(post.data, mode));
}

export function buildRobotsText(_mode: SiteMode, site: URL): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    `Sitemap: ${new URL('/sitemap.xml', site)}`,
    '',
  ].join('\n');
}
