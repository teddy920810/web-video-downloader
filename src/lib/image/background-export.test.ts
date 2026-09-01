import { describe, expect, it, vi } from 'vitest';
import { composeBackground, downloadBackgroundResult } from './background-export';

describe('background result export', () => {
  it('fills the selected color before drawing the transparent result', async () => {
    const operations: string[] = [];
    const output = new Blob(['png'], { type: 'image/png' });
    const context = {
      fillStyle: '',
      fillRect: vi.fn(function (this: { fillStyle: string }) { operations.push(`fill:${this.fillStyle}`); }),
      drawImage: vi.fn(() => operations.push('draw')),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toBlob: vi.fn((callback: BlobCallback) => callback(output)),
    };
    const bitmap = { width: 2, height: 3, close: vi.fn() };

    await expect(composeBackground(new Blob(['source']), '#3b82f6', {
      createCanvas: () => canvas as unknown as HTMLCanvasElement,
      decode: vi.fn().mockResolvedValue(bitmap as unknown as ImageBitmap),
    })).resolves.toBe(output);

    expect(canvas).toMatchObject({ width: 2, height: 3 });
    expect(operations).toEqual(['fill:#3b82f6', 'draw']);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('keeps alpha when transparent is selected', async () => {
    const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
    const canvas = { width: 0, height: 0, getContext: () => context, toBlob: (callback: BlobCallback) => callback(new Blob()) };
    await composeBackground(new Blob(['source']), 'transparent', {
      decode: vi.fn().mockResolvedValue({ width: 1, height: 1, close: vi.fn() } as unknown as ImageBitmap),
      createCanvas: () => canvas as unknown as HTMLCanvasElement,
    });
    expect(context.fillRect).not.toHaveBeenCalled();
    expect(context.drawImage).toHaveBeenCalledOnce();
  });

  it('creates and clicks a local PNG download after fetching the private result', async () => {
    const click = vi.fn();
    const revokeObjectURL = vi.fn();
    const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
      toBlob: (callback: BlobCallback) => callback(new Blob(['output'], { type: 'image/png' })),
    };
    const anchor = { href: '', download: '', click };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Blob(['source']), { status: 200 })));
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 1, height: 1, close: vi.fn() }));
    vi.stubGlobal('document', { createElement: vi.fn((tag: string) => tag === 'canvas' ? canvas : anchor) });
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:result'), revokeObjectURL });
    vi.stubGlobal('window', { setTimeout: (callback: () => void) => { callback(); return 1; } });

    await downloadBackgroundResult('https://result.example.test/output.png', '#3b82f6');

    expect(fetch).toHaveBeenCalledWith('https://result.example.test/output.png', { cache: 'no-store' });
    expect(context.fillStyle).toBe('#3b82f6');
    expect(anchor).toMatchObject({ href: 'blob:result', download: 'streamnest-background-removed.png' });
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:result');
    vi.unstubAllGlobals();
  });

  it('rejects an unavailable result response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(downloadBackgroundResult('https://result.example.test/output.png', 'transparent'))
      .rejects.toThrow('Unable to prepare the image download.');
    vi.unstubAllGlobals();
  });

  it('reports unavailable canvas and PNG export failures', async () => {
    const bitmap = { width: 1, height: 1, close: vi.fn() } as unknown as ImageBitmap;
    await expect(composeBackground(new Blob(), '#ffffff', {
      decode: vi.fn().mockResolvedValue(bitmap),
      createCanvas: () => ({ width: 0, height: 0, getContext: () => null }) as unknown as HTMLCanvasElement,
    })).rejects.toThrow('Canvas processing is unavailable.');
    await expect(composeBackground(new Blob(), '#ffffff', {
      decode: vi.fn().mockResolvedValue(bitmap),
      createCanvas: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }),
        toBlob: (callback: BlobCallback) => callback(null),
      }) as unknown as HTMLCanvasElement,
    })).rejects.toThrow('Unable to create the PNG file.');
  });
});
