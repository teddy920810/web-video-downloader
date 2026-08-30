import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { MediaPlan } from './browser-media';

// Loading shape follows the official ffmpeg.wasm 0.12 usage contract.
// https://ffmpegwasm.netlify.app/docs/getting-started/usage/
const CORE_BASE_URL = '/vendor/ffmpeg';

export type BrowserMediaRuntime = {
  run(file: File, plan: MediaPlan, onProgress: (progress: number) => void): Promise<Blob>;
  terminate(): void;
};

export async function createBrowserMediaRuntime(): Promise<BrowserMediaRuntime> {
  const ffmpeg = new FFmpeg();
  await ffmpeg.load({
    coreURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  return {
    async run(file, plan, onProgress) {
      const progressHandler = ({ progress }: { progress: number }) => {
        onProgress(Math.max(0, Math.min(1, progress)));
      };
      ffmpeg.on('progress', progressHandler);
      try {
        await ffmpeg.writeFile(plan.inputName, await fetchFile(file));
        const exitCode = await ffmpeg.exec(plan.args);
        if (exitCode !== 0) throw new Error('The browser media engine could not process this file.');
        const output = await ffmpeg.readFile(plan.outputName);
        if (typeof output === 'string') throw new Error('The browser media engine returned an invalid file.');
        return new Blob([new Uint8Array(output)], { type: plan.mimeType });
      } finally {
        ffmpeg.off('progress', progressHandler);
        try { await ffmpeg.deleteFile(plan.inputName); } catch { /* best-effort memory cleanup */ }
        try { await ffmpeg.deleteFile(plan.outputName); } catch { /* best-effort memory cleanup */ }
      }
    },
    terminate() {
      ffmpeg.terminate();
    },
  };
}
