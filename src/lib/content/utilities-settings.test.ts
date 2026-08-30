import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { utilitiesSettingsSchema } from './utilities-settings';

const settings = JSON.parse(readFileSync(new URL('../../content/settings/utilities.json', import.meta.url), 'utf8'));

describe('utilities CMS settings', () => {
  it('validates every utility surface and local form label', () => {
    const parsed = utilitiesSettingsSchema.parse(settings);
    expect(parsed.home.tools.map((tool) => tool.href)).toEqual(['/video-converter', '/video-compressor']);
    expect(parsed.converter.notes).toHaveLength(4);
    expect(parsed.compressor.notes).toHaveLength(4);
    expect(parsed.tool.privacyLabel).toContain('not uploaded');
  });
});
