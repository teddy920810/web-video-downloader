export const MAX_LOCAL_IMAGE_BYTES = 50 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 8192;

export type LocalImageMetadata = { name: string; size: number; type: string };
export type LocalImageValidation = { ok: true } | { ok: false; message: string };
export type ImageToolMode = 'converter' | 'compressor' | 'resizer';
export type ImageFormat = 'png' | 'jpeg' | 'webp';

export type ImagePlan = {
  mimeType: `image/${ImageFormat}`;
  extension: 'png' | 'jpg' | 'webp';
  quality: number;
  width?: number;
};

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateLocalImage(file: LocalImageMetadata): LocalImageValidation {
  if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false, message: 'Choose a non-empty image file.' };
  if (!IMAGE_TYPES.has(file.type)) return { ok: false, message: 'Choose a JPG, PNG, or WebP image.' };
  if (file.size > MAX_LOCAL_IMAGE_BYTES) return { ok: false, message: 'Browser image tools support files up to 50 MB.' };
  return { ok: true };
}

export function buildImagePlan(mode: ImageToolMode, options: { format?: ImageFormat; quality?: number; width?: number }): ImagePlan {
  const quality = options.quality ?? (mode === 'compressor' ? 0.72 : 0.9);
  if (!Number.isFinite(quality) || quality <= 0 || quality > 1) throw new Error('Image quality must be between 0 and 1.');
  if (mode === 'resizer' && (!Number.isInteger(options.width) || (options.width ?? 0) < 1 || (options.width ?? 0) > MAX_IMAGE_DIMENSION)) {
    throw new Error(`Image width must be between 1 and ${MAX_IMAGE_DIMENSION}.`);
  }
  const format = mode === 'converter' ? (options.format ?? 'png') : 'webp';
  return {
    mimeType: `image/${format}`,
    extension: format === 'jpeg' ? 'jpg' : format,
    quality: format === 'png' ? 1 : quality,
    ...(mode === 'resizer' ? { width: options.width } : {}),
  };
}
