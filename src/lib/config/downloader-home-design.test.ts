import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readProjectFile = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

describe('downloader homepage visual contract', () => {
  it('keeps the real online downloader as the primary hero action', () => {
    const page = readProjectFile('src/pages/index.astro');

    expect(page).toContain('class="download-home"');
    expect(page).toContain('Save public videos.');
    expect(page).toContain('<em>Simply.</em>');
    expect(page).toContain('<UrlDownloader client:load />');
    expect(page.indexOf('<UrlDownloader client:load />')).toBeLessThan(page.indexOf('id="desktop-app"'));
  });

  it('presents the desktop product honestly as coming soon', () => {
    const page = readProjectFile('src/pages/index.astro');
    const desktopSection = page.slice(page.indexOf('id="desktop-app"'));

    expect(desktopSection).toContain('Desktop power is on the way');
    expect(desktopSection).toContain('Coming soon');
    expect(desktopSection).toContain('Early access coming soon');
    expect(desktopSection).not.toMatch(/href=["'][^"']*\.(exe|dmg|pkg|msi)/i);
    expect(desktopSection).not.toContain('4K');
    expect(desktopSection).not.toContain('batch download');
  });

  it('defines the selected aurora visual direction and responsive desktop teaser', () => {
    const css = readProjectFile('src/styles/global.css');

    expect(css).toContain('--download-night: #07153f');
    expect(css).toContain('.download-aurora');
    expect(css).toContain('.desktop-coming-soon');
    expect(css).toContain('.download-site .header-auth { display: none; }');
    expect(css).toContain('@media (max-width: 900px)');
  });
});
