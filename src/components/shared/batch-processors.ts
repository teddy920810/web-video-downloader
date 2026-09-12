import { buildImagePlan, validateLocalImage, type ImageFormat, type ImageToolMode } from '../../lib/image/browser-image';
import { encodeUnderTarget, buildTargetVideoPlan } from '../../lib/media/target-size';
import { assessBrowserMediaRisk, buildAudioExtractionPlanAttempts, buildCompressionPlanAttempts, buildConversionPlanAttempts, buildGifPlanAttempts, buildMergePlanAttempts, buildTrimPlanAttempts, validateLocalVideo, type CompressionPreset, type ConversionTarget, type MediaPlan } from '../../lib/media/browser-media';
import { runBrowserMediaPlans } from '../../lib/media/browser-job';
import type { BrowserMediaRuntime } from '../../lib/media/ffmpeg-runtime';
import { validateBatchRange } from '../../lib/media/batch-range';

export type BatchResult = { blob: Blob; name: string; rawBlob?: Blob };
export type ImageOptions = { format?: ImageFormat; quality?: number; width?: number; targetBytes?: number; background?: string };

export async function processLocalImage(file: File, mode: ImageToolMode, options: ImageOptions): Promise<BatchResult> {
  const validation = validateLocalImage(file);
  if (!validation.ok) throw new Error(validation.message);
  const plan = buildImagePlan(mode, options);
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  try {
    if (bitmap.width * bitmap.height > 40_000_000) throw new Error('This image has too many pixels for safe browser processing. Resize it first.');
    canvas.width = plan.width ? Math.min(plan.width, bitmap.width) : bitmap.width;
    canvas.height = Math.max(1, Math.round(bitmap.height * canvas.width / bitmap.width));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas processing is not available in this browser.');
    if (plan.mimeType === 'image/jpeg') {
      context.fillStyle = options.background ?? '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const encode = (quality: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => {
      if (!blob || blob.type !== plan.mimeType) reject(new Error('The requested image format is unavailable in this browser.'));
      else resolve(blob);
    }, plan.mimeType, quality));
    const blob = mode === 'compressor' && options.targetBytes !== undefined
      ? await encodeUnderTarget(options.targetBytes, encode) : await encode(plan.quality);
    return { blob, name: `${mode === 'converter' ? 'converted' : mode === 'compressor' ? 'compressed' : 'resized'}.${plan.extension}` };
  } finally { bitmap.close(); canvas.width = 0; canvas.height = 0; }
}

export type VideoMode = 'converter' | 'compressor' | 'trimmer' | 'audio' | 'gif' | 'merger';
export type VideoOptions = { target?: ConversionTarget; preset?: CompressionPreset; audio?: 'mp3' | 'wav'; start?: number; end?: number; duration?: number; width?: number; targetBytes?: number };

export async function processLocalVideo(files: File[], mode: VideoMode, options: VideoOptions, hooks: {
  progress: (n: number) => void; runtime: (r: BrowserMediaRuntime | null) => void; cancelled: () => boolean;
}): Promise<BatchResult> {
  for (const file of files) { const check = validateLocalVideo(file); if (!check.ok) throw new Error(check.message); }
  if (!files.length || files.reduce((n, f) => n + f.size, 0) > 250 * 1024 * 1024) throw new Error('Each video task must total 250 MB or less.');
  const file = files[0];
  const metadata = await readVideoMetadata(file).catch(() => undefined);
  const risk = assessBrowserMediaRisk({ size: files.reduce((n, f) => n + f.size, 0), ...metadata });
  if (mode === 'trimmer' || mode === 'gif') {
    const start = options.start ?? 0;
    validateBatchRange(start, mode === 'trimmer' ? options.end ?? 10 : start + (options.duration ?? 5), metadata?.durationSeconds ?? NaN);
  }
  const run = (plans: MediaPlan[]) => runBrowserMediaPlans({ files, plans,
    createRuntime: async () => (await import('../../lib/media/ffmpeg-runtime')).createBrowserMediaRuntime(),
    onProgress: hooks.progress, onRuntime: hooks.runtime, isCancelled: hooks.cancelled,
  });
  if (mode === 'compressor' && options.targetBytes !== undefined) {
    const duration = metadata?.durationSeconds ?? NaN;
    let plan = buildTargetVideoPlan(file.name, options.targetBytes, duration);
    let blob = await run([plan]);
    if (blob.size > options.targetBytes) {
      plan = buildTargetVideoPlan(file.name, options.targetBytes, duration, Math.min(0.8, options.targetBytes / blob.size * 0.8));
      blob = await run([plan]);
    }
    if (blob.size > options.targetBytes) throw new Error('The video could not meet this target size. Increase the target and try again.');
    return { blob, name: plan.outputName };
  }
  const plans = mode === 'converter' ? buildConversionPlanAttempts(file.name, options.target ?? 'mp4', risk)
    : mode === 'compressor' ? buildCompressionPlanAttempts(file.name, options.preset ?? 'balanced', risk)
    : mode === 'trimmer' ? buildTrimPlanAttempts(file.name, { startSeconds: options.start ?? 0, endSeconds: options.end ?? 10 }, risk)
    : mode === 'audio' ? buildAudioExtractionPlanAttempts(file.name, options.audio ?? 'mp3')
    : mode === 'merger' ? buildMergePlanAttempts(files.map(f => f.name), risk)
    : buildGifPlanAttempts(file.name, { startSeconds: options.start ?? 0, durationSeconds: options.duration ?? 5, width: options.width ?? 640 }, risk);
  try { return { blob: await run(plans), name: plans[0].outputName }; }
  catch (error) {
    if (mode === 'audio' && !hooks.cancelled()) throw new Error('Could not extract readable audio. This file may have no audio track or use an unsupported codec. Try another file.');
    throw error;
  }
}

function readVideoMetadata(file: File): Promise<{ durationSeconds: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    const cleanup = () => { clearTimeout(timer); video.onloadedmetadata = null; video.onerror = null; video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); };
    const fail = () => { cleanup(); reject(new Error('Video duration is unavailable. Use preset compression for this file.')); };
    const timer = setTimeout(fail, 15000);
    video.preload = 'metadata';
    video.onloadedmetadata = () => { const metadata = { durationSeconds: video.duration, width: video.videoWidth, height: video.videoHeight }; cleanup(); resolve(metadata); };
    video.onerror = fail;
    video.src = url;
  });
}
