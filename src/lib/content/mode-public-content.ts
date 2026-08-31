import type { SiteMode } from '../config/site-mode';
import type { ProductArea } from './blog-entry';

export type { ProductArea } from './blog-entry';

export function isPostVisibleInMode(post: { productArea?: ProductArea }, mode: SiteMode) {
  return mode === 'downloader' || (post.productArea ?? 'downloader') !== 'downloader';
}

export function filterPostsForMode<T extends { data: { productArea?: ProductArea } }>(posts: T[], mode: SiteMode) {
  return posts.filter((post) => isPostVisibleInMode(post.data, mode));
}

export interface UtilityLegalPage {
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  introduction: string;
  sections: Array<{ heading: string; body: string }>;
}

export const utilityLegalPages: Record<'privacy' | 'terms', UtilityLegalPage> = {
  privacy: {
    title: 'Privacy Policy | Streamnest Video Tools',
    description: 'How Streamnest protects local video processing and private AI image processing.',
    eyebrow: 'Privacy',
    heading: 'Clear boundaries for every media tool',
    introduction: 'The converter and compressor process video in your browser. Background removal securely uploads only the image you choose for temporary processing.',
    sections: [
      {
        heading: 'Local processing',
        body: 'The browser temporarily uses memory and local object URLs to process and save the result. Closing the page or clearing the result releases that temporary browser data.',
      },
      {
        heading: 'Technical data',
        body: 'Background-removal inputs and results use private object storage and temporary signed links. The processing provider receives the selected image only to complete the requested task. Standard request logs may be processed for security and reliability.',
      },
      {
        heading: 'Account information',
        body: 'If you use Google sign-in, we store the account identifier and email address needed to provide and protect your Streamnest account.',
      },
      {
        heading: 'Your choices',
        body: 'Choose only files you are permitted to process. You can stop an active task at any time by using Cancel or closing the browser tab.',
      },
    ],
  },
  terms: {
    title: 'Terms of Use | Streamnest Video Tools',
    description: 'Terms for using Streamnest video and image tools.',
    eyebrow: 'Terms',
    heading: 'Use media tools responsibly',
    introduction: 'By using these tools, you confirm that you own the selected media or have permission to process it.',
    sections: [
      {
        heading: 'Browser processing',
        body: 'Conversion and compression run in your browser. Background removal uses a private online processing service. Performance and supported formats depend on the selected tool, file, browser, and available service capacity.',
      },
      {
        heading: 'Acceptable use',
        body: 'Do not use the service to process unlawful material, interfere with the website, or violate another person’s rights.',
      },
      {
        heading: 'Availability',
        body: 'The tools are provided as available. A task may fail when a browser cannot decode the selected format or the device does not have enough memory.',
      },
    ],
  },
};

export function buildRobotsText(_mode: SiteMode, site: URL): string {
  const rules = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    `Sitemap: ${new URL('/sitemap.xml', site)}`,
    '',
  ];
  return rules.join('\n');
}
