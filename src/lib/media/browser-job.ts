import type { BrowserMediaRuntime } from './ffmpeg-runtime';
import type { MediaPlan } from './browser-media';

export class BrowserMediaJobCancelledError extends Error {
  constructor() {
    super('Processing was cancelled.');
    this.name = 'BrowserMediaJobCancelledError';
  }
}

type BrowserMediaJobOptions = {
  files: File[];
  plans: MediaPlan[];
  createRuntime: () => Promise<BrowserMediaRuntime>;
  onProgress: (progress: number) => void;
  onRuntime?: (runtime: BrowserMediaRuntime | null) => void;
  onRetry?: (plan: MediaPlan, cause: unknown) => void;
  isCancelled?: () => boolean;
};

export async function runBrowserMediaPlans(options: BrowserMediaJobOptions) {
  if (!options.files.length) throw new Error('Choose at least one media file.');
  if (!options.plans.length) throw new Error('No browser media plan is available.');

  let lastError: unknown;
  for (const [index, plan] of options.plans.slice(0, 2).entries()) {
    if (options.isCancelled?.()) throw new BrowserMediaJobCancelledError();
    let runtime: BrowserMediaRuntime | null = null;
    try {
      runtime = await options.createRuntime();
      options.onRuntime?.(runtime);
      const result = options.files.length === 1
        ? await runtime.run(options.files[0], plan, options.onProgress)
        : await runtime.runMany(options.files, plan, options.onProgress);
      if (options.isCancelled?.()) throw new BrowserMediaJobCancelledError();
      return result;
    } catch (cause) {
      lastError = cause;
      if (options.isCancelled?.()) throw new BrowserMediaJobCancelledError();
      const retry = options.plans[index + 1];
      if (!retry || index > 0) throw cause;
      options.onRetry?.(retry, cause);
    } finally {
      try { runtime?.terminate(); } catch { /* the cancel path may have already terminated this worker */ }
      options.onRuntime?.(null);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('The browser media engine could not process this file.');
}
