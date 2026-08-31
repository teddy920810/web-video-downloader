import { describe, expect, it } from 'vitest';
import { buildImagePlan, validateLocalImage } from './browser-image';

describe('browser-local image tools', () => {
  const image = { name: 'photo.webp', size: 2 * 1024 * 1024, type: 'image/webp' };

  it('accepts bounded browser-readable images', () => {
    expect(validateLocalImage(image)).toEqual({ ok: true });
    expect(validateLocalImage({ ...image, size: 0 })).toMatchObject({ ok: false });
    expect(validateLocalImage({ ...image, type: 'application/pdf' })).toMatchObject({ ok: false });
    expect(validateLocalImage({ ...image, size: 51 * 1024 * 1024 })).toMatchObject({ ok: false });
  });

  it('builds conversion, compression, and resize plans without a server destination', () => {
    expect(buildImagePlan('converter', { format: 'png' })).toMatchObject({ mimeType: 'image/png', extension: 'png', quality: 1 });
    expect(buildImagePlan('compressor', { quality: 0.72 })).toMatchObject({ mimeType: 'image/webp', extension: 'webp', quality: 0.72 });
    expect(buildImagePlan('resizer', { width: 1280 })).toMatchObject({ width: 1280, mimeType: 'image/webp' });
  });

  it('rejects unsafe output dimensions and quality', () => {
    expect(() => buildImagePlan('resizer', { width: 0 })).toThrow('width');
    expect(() => buildImagePlan('resizer', { width: 9000 })).toThrow('width');
    expect(() => buildImagePlan('compressor', { quality: 2 })).toThrow('quality');
  });
});
