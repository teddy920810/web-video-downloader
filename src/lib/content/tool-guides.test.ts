import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { TOOLS } from '../product/catalog';
import { toolGuideSchema } from './tool-guides';

describe('tool landing content', () => {
  it('provides an independently editable guide for every existing utility', () => {
    const directory = new URL('../../content/tool-guides/', import.meta.url);
    const files = readdirSync(directory).filter((name) => name.endsWith('.json'));
    expect(files.map((name) => name.slice(0, -5)).sort()).toEqual(TOOLS.map((tool) => tool.id).sort());
    for (const file of files) {
      const guide = toolGuideSchema.parse(JSON.parse(readFileSync(new URL(file, directory), 'utf8')));
      expect(guide.toolId).toBe(file.slice(0, -5));
      expect(guide.steps.items).toHaveLength(3);
      expect(guide.features.items.length).toBeGreaterThanOrEqual(2);
      expect(guide.faq.items.length).toBeGreaterThanOrEqual(3);
      expect(JSON.stringify(guide)).not.toMatch(/HitPaw|9GB|1000\+|no quality loss/);
    }
  });

  it('rejects incomplete sections rather than rendering empty marketing panels', () => {
    expect(toolGuideSchema.safeParse({ features: {}, steps: {}, faq: {} }).success).toBe(false);
  });

  it('exposes all three sections in Pages CMS without changing route filenames', () => {
    const cms = parse(readFileSync(new URL('../../../.pages.yml', import.meta.url), 'utf8'));
    const collection = cms.content.find((item: { name: string }) => item.name === 'tool-guides');
    expect(collection.path).toBe('src/content/tool-guides');
    expect(collection.operations).toEqual({ create: false, rename: false, delete: false });
    expect(collection.fields.map((field: { name: string }) => field.name)).toEqual(['toolId', 'features', 'steps', 'faq']);
  });
});
