import { buildCompressionPlan, type MediaPlan } from './browser-media';

export function targetBytes(value: string, unit: 'KB' | 'MB'): number {
  const bytes = Math.floor(Number(value) * (unit === 'KB' ? 1024 : 1024 * 1024));
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > 250 * 1024 * 1024) throw new Error('Enter a target size greater than zero and no larger than 250 MB.');
  return bytes;
}

/** Search quality only; never quietly resize, truncate, or return an oversized success. */
export async function encodeUnderTarget(bytes: number, encode: (quality: number) => Promise<Blob>) {
  if (!Number.isSafeInteger(bytes) || bytes < 1) throw new Error('Enter a valid target size.');
  const best = await encode(0.9);
  if (best.size <= bytes) return best;
  let low = 0.05;
  let high = 0.9;
  let result = await encode(low);
  if (result.size > bytes) throw new Error('This target size cannot be reached without resizing the image. Increase the target or resize first.');
  for (let attempt = 0; attempt < 7; attempt++) {
    const quality = (low + high) / 2;
    const blob = await encode(quality);
    if (blob.size <= bytes) { low = quality; result = blob; } else { high = quality; }
  }
  return result;
}

export function buildTargetVideoPlan(name: string, bytes: number, duration: number, correction = 1): MediaPlan {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Video duration is unavailable. Use preset compression for this file.');
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || !Number.isFinite(correction) || correction <= 0 || correction > 1) throw new Error('Enter a valid target size.');
  // Leave space for muxing overhead. Audio budget is reserved even when no audio is present.
  const videoBitrate = Math.floor(bytes * 8 * 0.85 / duration * correction - 32000);
  if (videoBitrate < 16000) throw new Error('The target is too small for this video duration. Increase the target size.');
  const base = buildCompressionPlan(name, 'small');
  return { ...base, outputName: 'compressed-target.mp4', args: [
    '-i', base.inputName, '-map', '0:v:0', '-map', '0:a:0?',
    '-vf', 'scale=min(854\\,iw):-2', '-c:v', 'libx264', '-preset', 'veryfast', '-threads', '1',
    '-b:v', String(videoBitrate), '-maxrate', String(videoBitrate), '-bufsize', String(videoBitrate * 2),
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '32k', '-movflags', '+faststart', 'compressed-target.mp4',
  ] };
}
