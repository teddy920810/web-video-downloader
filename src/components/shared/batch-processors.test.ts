import { afterEach, expect, it, vi } from 'vitest';
import { processLocalImage, processLocalVideo } from './batch-processors';
import { runBrowserMediaPlans } from '../../lib/media/browser-job';
vi.mock('../../lib/media/browser-job', () => ({ runBrowserMediaPlans: vi.fn() }));

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

it('preserves the processing failure as cause while keeping the readable audio error', async () => {
  const cause = new Error('decoder failed');
  vi.mocked(runBrowserMediaPlans).mockRejectedValueOnce(cause);
  await expect(processLocalVideo([new File(['test'], 'clip.mp4', { type: 'video/mp4' })], 'audio', {}, {
    progress: vi.fn(), runtime: vi.fn(), cancelled: () => false,
  })).rejects.toMatchObject({
    message: 'Could not extract readable audio. This file may have no audio track or use an unsupported codec. Try another file.',
    cause,
  });
});
