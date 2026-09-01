import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOOLS } from '../product/catalog';
import { utilitiesSettingsSchema } from './utilities-settings';

const settings = JSON.parse(readFileSync(new URL('../../content/settings/utilities.json', import.meta.url), 'utf8'));

describe('utilities CMS settings', () => {
  it('validates every utility surface and local form label', () => {
    const parsed = utilitiesSettingsSchema.parse(settings);
    expect(parsed.home.tools.map((tool) => tool.href)).toEqual(TOOLS.map((tool) => tool.route));
    expect(Object.keys(parsed.toolPages)).toEqual([
      'video-trimmer',
      'video-merger',
      'audio-extractor',
      'video-to-gif',
      'image-converter',
      'image-compressor',
      'image-resizer',
      'svg-to-image',
    ]);
    expect(parsed.converter.notes).toHaveLength(4);
    expect(parsed.compressor.notes).toHaveLength(4);
    expect(parsed.backgroundRemover.notes).toHaveLength(4);
    expect(parsed.tool.privacyLabel).toContain('not uploaded');
    expect(parsed.backgroundTool.privacyLabel).toContain('processed only');
  });
});
