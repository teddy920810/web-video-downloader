import { afterEach, expect, it, vi } from 'vitest';
import { processLocalImage } from './batch-processors';

afterEach(() => vi.unstubAllGlobals());
it('fills JPEG transparency before drawing and releases decoded pixels', async () => {
  const operations: string[] = [];
  const bitmap = { width: 4, height: 2, close: vi.fn() };
  const context = { fillStyle: '', fillRect() { operations.push(this.fillStyle); }, drawImage() { operations.push('draw'); } };
  const canvas = { width: 0, height: 0, getContext: () => context, toBlob: (callback: BlobCallback, mime: string) => callback(new Blob(['test'], { type: mime })) };
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
  vi.stubGlobal('document', { createElement: () => canvas });
  const output = await processLocalImage(new File(['test'], 'a.png', { type: 'image/png' }), 'converter', { format: 'jpeg', background: '#3b82f6' });
  expect(output.blob.type).toBe('image/jpeg');
  expect(operations).toEqual(['#3b82f6', 'draw']);
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(canvas.width).toBe(0);
});
