import { describe, expect, it, vi } from 'vitest';
import { inspectSvgSource, outputForSvgFormat, rasterizeSvg } from './svg-raster';

describe('browser-local SVG rasterization', () => {
  it('derives bounded dimensions from width, height, or viewBox', () => {
    expect(inspectSvgSource('<svg width="640" height="360"></svg>')).toMatchObject({ width: 640, height: 360 });
    expect(inspectSvgSource('<svg viewBox="0 0 320 180"></svg>')).toMatchObject({ width: 320, height: 180 });
    expect(inspectSvgSource('<svg width="400" viewBox="0 0 4 3"></svg>')).toMatchObject({ width: 400, height: 300 });
    expect(inspectSvgSource('<svg height="300" viewBox="0 0 4 3"></svg>')).toMatchObject({ width: 400, height: 300 });
    expect(inspectSvgSource('<svg></svg>')).toMatchObject({ width: 1200, height: 630 });
    expect(() => inspectSvgSource('<svg><defs><linearGradient id="g"/></defs><rect fill="url(\'#g\')"/></svg>')).not.toThrow();
  });

  it('rejects executable, externally loaded, malformed, and oversized SVG input', () => {
    expect(() => inspectSvgSource('<svg><script>alert(1)</script></svg>')).toThrow('unsafe');
    expect(() => inspectSvgSource('<svg><image href="https://tracker.example/pixel.png"/></svg>')).toThrow('external');
    expect(() => inspectSvgSource('<svg onload="alert(1)"></svg>')).toThrow('unsafe');
    expect(() => inspectSvgSource('<svg><style>@import url(https://example.com/a.css)</style></svg>')).toThrow('external');
    expect(() => inspectSvgSource('<!DOCTYPE svg><svg></svg>')).toThrow('unsafe');
    expect(() => inspectSvgSource('<html></html>')).toThrow('valid SVG');
    expect(() => inspectSvgSource('<svg width="9000" height="10"></svg>')).toThrow('8192');
    expect(() => inspectSvgSource('<svg width="8000" height="8000"></svg>')).toThrow('32 megapixels');
  });

  it('maps supported output formats to safe filenames and MIME types', () => {
    expect(outputForSvgFormat('png')).toEqual({ mimeType: 'image/png', extension: 'png' });
    expect(outputForSvgFormat('jpeg')).toEqual({ mimeType: 'image/jpeg', extension: 'jpg' });
    expect(outputForSvgFormat('webp')).toEqual({ mimeType: 'image/webp', extension: 'webp' });
  });

  it('renders a parsed SVG into a browser canvas and releases its temporary URL', async () => {
    const output = new Blob(['png'], { type: 'image/png' });
    const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => context), toBlob: vi.fn((callback: BlobCallback) => callback(output)) };
    const root = { localName: 'svg', setAttribute: vi.fn() };
    const parsedDocument = { querySelector: vi.fn(() => null), querySelectorAll: vi.fn(() => []), documentElement: root };
    const revokeObjectURL = vi.fn();
    class TestImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal('DOMParser', class { parseFromString() { return parsedDocument; } });
    vi.stubGlobal('XMLSerializer', class { serializeToString() { return '<svg width="2" height="3"></svg>'; } });
    vi.stubGlobal('Image', TestImage);
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:svg'), revokeObjectURL });
    vi.stubGlobal('window', { document: { createElement: vi.fn(() => canvas) } });

    await expect(rasterizeSvg('<svg width="2" height="3"></svg>', 'jpeg')).resolves.toBe(output);
    expect(root.setAttribute).toHaveBeenCalledWith('width', '2');
    expect(root.setAttribute).toHaveBeenCalledWith('height', '3');
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 2, 3);
    expect(context.drawImage).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:svg');
    vi.unstubAllGlobals();
  });

  it('reports parser, canvas, and export failures', async () => {
    const validRoot = { localName: 'svg', setAttribute: vi.fn() };
    const validDocument = { querySelector: vi.fn(() => null), querySelectorAll: vi.fn(() => []), documentElement: validRoot };
    class TestImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal('XMLSerializer', class { serializeToString() { return '<svg></svg>'; } });
    vi.stubGlobal('Image', TestImage);
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:svg'), revokeObjectURL: vi.fn() });
    vi.stubGlobal('DOMParser', class { parseFromString() { return { ...validDocument, querySelector: () => ({}) }; } });
    await expect(rasterizeSvg('<svg></svg>', 'png')).rejects.toThrow('parsed');

    vi.stubGlobal('DOMParser', class { parseFromString() { return validDocument; } });
    vi.stubGlobal('window', { document: { createElement: () => ({ width: 0, height: 0, getContext: () => null }) } });
    await expect(rasterizeSvg('<svg></svg>', 'png')).rejects.toThrow('Canvas processing');

    vi.stubGlobal('window', { document: { createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }),
      toBlob: (callback: BlobCallback) => callback(null),
    }) } });
    await expect(rasterizeSvg('<svg></svg>', 'webp')).rejects.toThrow('selected image format');
    vi.unstubAllGlobals();
  });
});
