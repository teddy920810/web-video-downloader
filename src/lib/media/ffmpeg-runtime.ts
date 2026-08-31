import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { MediaPlan } from './browser-media';

// Loading shape follows the official ffmpeg.wasm 0.12 usage contract.
// https://ffmpegwasm.netlify.app/docs/getting-started/usage/
const CORE_BASE_URL = '/vendor/ffmpeg';

export type BrowserMediaRuntime = {
  run(file: File, plan: MediaPlan, onProgress: (progress: number) => void): Promise<Blob>;
  runMany(files: File[], plan: MediaPlan, onProgress: (progress: number) => void): Promise<Blob>;
  terminate(): void;
};

export async function createBrowserMediaRuntime(): Promise<BrowserMediaRuntime> {
  const ffmpeg = new FFmpeg();
  await ffmpeg.load({
    coreURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  async function execute(files: File[], plan: MediaPlan, onProgress: (progress: number) => void) {
      const progressHandler = ({ progress }: { progress: number }) => {
        onProgress(Math.max(0, Math.min(1, progress)));
      };
      ffmpeg.on('progress', progressHandler);
      const inputNames = plan.inputNames ?? [plan.inputName];
      try {
        if (files.length !== inputNames.length) throw new Error('The selected files do not match this media job.');
        await Promise.all(files.map(async (file, index) => ffmpeg.writeFile(inputNames[index], await fetchFile(file))));
        await Promise.all((plan.supportFiles ?? []).map((file) => ffmpeg.writeFile(file.name, file.content)));
        const exitCode = await ffmpeg.exec(plan.args);
        if (exitCode !== 0) throw new Error('The browser media engine could not process this file.');
        const output = await ffmpeg.readFile(plan.outputName);
        if (typeof output === 'string') throw new Error('The browser media engine returned an invalid file.');
        return new Blob([new Uint8Array(output)], { type: plan.mimeType });
      } finally {
        ffmpeg.off('progress', progressHandler);
        await Promise.all(inputNames.map(async (name) => {
          try { await ffmpeg.deleteFile(name); } catch { /* best-effort memory cleanup */ }
        }));
        await Promise.all((plan.supportFiles ?? []).map(async (file) => {
          try { await ffmpeg.deleteFile(file.name); } catch { /* best-effort memory cleanup */ }
        }));
        try { await ffmpeg.deleteFile(plan.outputName); } catch { /* best-effort memory cleanup */ }
      }
  }

  return {
    run(file, plan, onProgress) {
      return execute([file], plan, onProgress);
    },
    runMany(files, plan, onProgress) {
      return execute(files, plan, onProgress);
    },
    terminate() {
      ffmpeg.terminate();
    },
  };
}
