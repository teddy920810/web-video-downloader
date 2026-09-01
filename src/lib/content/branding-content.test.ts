import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const contentFiles = [
  '../../content/settings/site.json',
  '../../content/legal/privacy.md',
  '../../content/legal/terms.md',
  '../../content/legal/refund-policy.md',
];

describe('public brand content', () => {
  it('does not retain watermark-product branding', () => {
    const content = contentFiles.map((file) => readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');

    expect(content.toLowerCase()).not.toContain('watermarkgemini');
    expect(content.toLowerCase()).not.toContain('image watermark remover');
  });
});
