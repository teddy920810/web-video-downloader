import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('preserves the approved Hero markup and existing tool CMS content', () => {
  const root = new URL('../../', import.meta.url);
  for (const path of ['components/products/UtilityToolPage.astro', 'pages/video-converter.astro', 'pages/video-compressor.astro', 'pages/background-remover.astro']) {
    const source = readFileSync(new URL(path, root), 'utf8').replaceAll('\r\n', '\n');
    const hero = source.match(/<section class="utility-hero[\s\S]*?<\/section>/)?.[0];
    expect(hero).toBeTruthy();
    expect(hero).toMatchSnapshot(path);
    // Keep the original percentage-positioned background at its original height.
    expect(source.lastIndexOf('</div>'), path).toBeLessThan(source.indexOf('<ToolGuideSections />'));
  }
  const existing = JSON.parse(readFileSync(new URL('content/settings/utilities.json', root), 'utf8'));
  expect(existing).toMatchSnapshot('Existing utilities CMS values');
});
