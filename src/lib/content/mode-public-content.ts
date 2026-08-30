import type { SiteMode } from '../config/site-mode';

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
    description: 'How Streamnest Video Tools protects files processed locally in your browser.',
    eyebrow: 'Privacy',
    heading: 'Your selected video stays on your device',
    introduction: 'The converter and compressor process the file you choose inside your browser. The media file is not sent to our application servers.',
    sections: [
      {
        heading: 'Local processing',
        body: 'The browser temporarily uses memory and local object URLs to process and save the result. Closing the page or clearing the result releases that temporary browser data.',
      },
      {
        heading: 'Technical data',
        body: 'Our hosting provider may process standard request logs for security and reliability. Those requests deliver the website code and media engine, not the local media file you select.',
      },
      {
        heading: 'Your choices',
        body: 'Choose only files you are permitted to process. You can stop an active task at any time by using Cancel or closing the browser tab.',
      },
    ],
  },
  terms: {
    title: 'Terms of Use | Streamnest Video Tools',
    description: 'Terms for using the local Streamnest video converter and compressor.',
    eyebrow: 'Terms',
    heading: 'Use local video tools responsibly',
    introduction: 'By using these tools, you confirm that you own the selected media or have permission to process it.',
    sections: [
      {
        heading: 'Browser processing',
        body: 'Conversion and compression run in your current browser session. Performance and supported formats depend on your device, browser, and available memory.',
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

export function buildRobotsText(mode: SiteMode, site: URL): string {
  const rules = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    ...(mode === 'utilities' ? ['Disallow: /blog'] : []),
    `Sitemap: ${new URL('/sitemap.xml', site)}`,
    '',
  ];
  return rules.join('\n');
}
