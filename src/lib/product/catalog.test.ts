import { describe, expect, it } from 'vitest';
import { PRODUCT_PLANS, TOOLS, toolsForMode } from './catalog';

describe('product catalog', () => {
  it('keeps one neutral catalog for downloader and utilities modes', () => {
    expect(TOOLS.map((tool) => tool.id)).toEqual([
      'video-converter',
      'video-compressor',
      'video-trimmer',
      'video-merger',
      'audio-extractor',
      'video-to-gif',
      'image-converter',
      'image-compressor',
      'image-resizer',
      'svg-to-image',
      'background-remover',
    ]);
    expect(toolsForMode('utilities')).toHaveLength(TOOLS.length);
    expect(toolsForMode('downloader')).toHaveLength(TOOLS.length);
    expect(TOOLS.every((tool) => !tool.route.includes('download'))).toBe(true);
  });

  it('charges only provider-backed tools and keeps local tools free', () => {
    const background = TOOLS.find((tool) => tool.id === 'background-remover');
    expect(background).toMatchObject({ processing: 'cloud', credits: 1 });
    expect(TOOLS.filter((tool) => tool.processing === 'local').every((tool) => tool.credits === 0)).toBe(true);
  });

  it('defines free and pro value without coupling it to a payment provider', () => {
    expect(PRODUCT_PLANS.free).toMatchObject({ monthlyCredits: 1, maxLocalFileBytes: 250 * 1024 * 1024 });
    expect(PRODUCT_PLANS.pro.monthlyCredits).toBeGreaterThan(PRODUCT_PLANS.free.monthlyCredits);
    expect(PRODUCT_PLANS.pro.maxLocalFileBytes).toBeGreaterThan(PRODUCT_PLANS.free.maxLocalFileBytes);
    expect(PRODUCT_PLANS.pro.checkoutEnabled).toBe(false);
  });
});
