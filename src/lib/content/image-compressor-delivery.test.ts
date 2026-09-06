import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toolGuideSchema } from './tool-guides';

const source = JSON.parse(readFileSync(new URL('../../content/tool-guides/image-compressor.json', import.meta.url), 'utf8'));
describe('image compressor Word delivery', () => {
  it('publishes three illustrated features, three steps, six FAQs and the supporting modules', () => {
    const guide = toolGuideSchema.parse(source);
    expect(guide.features.heading).toBe('Image Compression with a Quality Setting You Control');
    expect(guide.features.items).toHaveLength(3);
    expect(guide.steps.items).toHaveLength(3);
    expect(guide.faq.items).toHaveLength(6);
    expect(guide.supporting?.map((section) => section.heading)).toEqual(['What Image Compression Changes', 'When to Use This Image Compressor']);
    expect(guide.finalCta?.href).toBe('#compressor-image-tool-title');
    for (const feature of guide.features.items) {
      expect(feature.image?.alt).toBeTruthy();
      expect(existsSync(new URL(`../../../public${feature.image?.src}`, import.meta.url))).toBe(true);
    }
    expect(JSON.stringify(guide)).not.toMatch(/HOLD|Production placement|Do not extend|link to Image Converter rather|Google PAA|Search Volume/);
  });

  it('accepts optional editorial modules while rejecting unsafe asset and action URLs', () => {
    expect(toolGuideSchema.safeParse({ ...source, finalCta: { heading: 'Ready?', body: 'Choose an image.', label: 'Choose', href: 'javascript:alert(1)' } }).success).toBe(false);
    expect(toolGuideSchema.safeParse({ ...source, features: { ...source.features, items: source.features.items.map((item: object) => ({ ...item, image: { src: '//untrusted.example/a.webp', alt: 'Image', width: 1200, height: 800 } })) } }).success).toBe(false);
  });
});
