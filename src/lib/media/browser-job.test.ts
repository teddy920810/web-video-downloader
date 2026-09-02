import { describe, expect, it, vi } from 'vitest';
import type { BrowserMediaRuntime } from './ffmpeg-runtime';
import type { MediaPlan } from './browser-media';
import { BrowserMediaJobCancelledError, runBrowserMediaPlans } from './browser-job';

const file = new File(['video'], 'input.mp4', { type: 'video/mp4' });
const plans: MediaPlan[] = [
  { inputName: 'input.mp4', outputName: 'fast.mp4', mimeType: 'video/mp4', args: ['-i', 'input.mp4', '-c', 'copy', 'fast.mp4'] },
  { inputName: 'input.mp4', outputName: 'safe.mp4', mimeType: 'video/mp4', args: ['-i', 'input.mp4', '-c:v', 'libx264', 'safe.mp4'] },
];

function runtime(run: BrowserMediaRuntime['run']): BrowserMediaRuntime {
  return { run, runMany: vi.fn(), terminate: vi.fn() };
}

describe('browser media job retries', () => {
  it('destroys the failed worker and retries exactly once with a fresh runtime', async () => {
    const first = runtime(vi.fn().mockRejectedValue(new Error('copy unsupported')));
    const second = runtime(vi.fn().mockResolvedValue(new Blob(['ok'])));
    const createRuntime = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const onRetry = vi.fn();

    const result = await runBrowserMediaPlans({ files: [file], plans, createRuntime, onProgress: vi.fn(), onRetry });

    expect(await result.text()).toBe('ok');
    expect(createRuntime).toHaveBeenCalledTimes(2);
    expect(first.terminate).toHaveBeenCalledOnce();
    expect(second.terminate).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledWith(plans[1], expect.any(Error));
  });

  it('never makes a third attempt after the safe retry fails', async () => {
    const createRuntime = vi.fn()
      .mockResolvedValueOnce(runtime(vi.fn().mockRejectedValue(new Error('first'))))
      .mockResolvedValueOnce(runtime(vi.fn().mockRejectedValue(new Error('second'))));

    await expect(runBrowserMediaPlans({ files: [file], plans, createRuntime, onProgress: vi.fn() }))
      .rejects.toThrow('second');
    expect(createRuntime).toHaveBeenCalledTimes(2);
  });

  it('uses the safe attempt when the first worker cannot load', async () => {
    const second = runtime(vi.fn().mockResolvedValue(new Blob(['recovered'])));
    const createRuntime = vi.fn()
      .mockRejectedValueOnce(new Error('worker load failed'))
      .mockResolvedValueOnce(second);

    const result = await runBrowserMediaPlans({ files: [file], plans, createRuntime, onProgress: vi.fn() });

    expect(await result.text()).toBe('recovered');
    expect(createRuntime).toHaveBeenCalledTimes(2);
  });

  it('does not retry after cancellation', async () => {
    let cancelled = false;
    const first = runtime(vi.fn().mockImplementation(async () => {
      cancelled = true;
      throw new Error('terminated');
    }));
    const createRuntime = vi.fn().mockResolvedValue(first);

    await expect(runBrowserMediaPlans({ files: [file], plans, createRuntime, onProgress: vi.fn(), isCancelled: () => cancelled }))
      .rejects.toBeInstanceOf(BrowserMediaJobCancelledError);
    expect(createRuntime).toHaveBeenCalledOnce();
  });
});
