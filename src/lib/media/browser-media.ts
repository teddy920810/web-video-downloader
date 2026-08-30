export const MAX_LOCAL_VIDEO_BYTES = 250 * 1024 * 1024;

export type ConversionTarget = 'mp4' | 'webm' | 'mp3';
export type CompressionPreset = 'small' | 'balanced' | 'quality';

export type LocalVideoMetadata = {
  name: string;
  size: number;
  type: string;
};

export type MediaPlan = {
  inputName: string;
  outputName: string;
  mimeType: string;
  args: string[];
};

export type LocalVideoValidation = { ok: true } | { ok: false; message: string };

const VIDEO_EXTENSIONS = new Set(['avi', 'm4v', 'mkv', 'mov', 'mp4', 'mpeg', 'mpg', 'webm']);

function extensionOf(name: string) {
  return name.toLowerCase().split('.').pop() ?? '';
}

export function validateLocalVideo(file: LocalVideoMetadata): LocalVideoValidation {
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, message: 'Choose a non-empty video file.' };
  }
  const isVideo = file.type.startsWith('video/')
    || (file.type === '' && VIDEO_EXTENSIONS.has(extensionOf(file.name)));
  if (!isVideo) return { ok: false, message: 'Choose a supported video file.' };
  if (file.size > MAX_LOCAL_VIDEO_BYTES) {
    return { ok: false, message: 'Browser processing supports files up to 250 MB.' };
  }
  return { ok: true };
}

function safeInputName(name: string) {
  const extension = extensionOf(name);
  return extension ? `input.${extension}` : 'input.video';
}

export function buildConversionPlan(inputFileName: string, target: ConversionTarget): MediaPlan {
  const inputName = safeInputName(inputFileName);
  if (target === 'mp3') {
    const outputName = 'converted.mp3';
    return {
      inputName,
      outputName,
      mimeType: 'audio/mpeg',
      args: ['-i', inputName, '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', outputName],
    };
  }
  if (target === 'webm') {
    const outputName = 'converted.webm';
    return {
      inputName,
      outputName,
      mimeType: 'video/webm',
      args: [
        '-i', inputName,
        '-map', '0:v:0', '-map', '0:a?',
        '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8',
        '-c:a', 'libopus',
        outputName,
      ],
    };
  }
  const outputName = 'converted.mp4';
  return {
    inputName,
    outputName,
    mimeType: 'video/mp4',
    args: [
      '-i', inputName,
      '-map', '0:v:0', '-map', '0:a?',
      '-c:v', 'libx264', '-preset', 'veryfast',
      '-c:a', 'aac', '-movflags', '+faststart',
      outputName,
    ],
  };
}

const COMPRESSION_PRESETS: Record<CompressionPreset, { crf: string; maxWidth: string; audioBitrate: string }> = {
  small: { crf: '32', maxWidth: '854', audioBitrate: '96k' },
  balanced: { crf: '28', maxWidth: '1280', audioBitrate: '128k' },
  quality: { crf: '24', maxWidth: '1920', audioBitrate: '160k' },
};

export function buildCompressionPlan(inputFileName: string, preset: CompressionPreset): MediaPlan {
  const inputName = safeInputName(inputFileName);
  const settings = COMPRESSION_PRESETS[preset];
  const outputName = `compressed-${preset}.mp4`;
  return {
    inputName,
    outputName,
    mimeType: 'video/mp4',
    args: [
      '-i', inputName,
      '-map', '0:v:0', '-map', '0:a?',
      '-vf', `scale=min(${settings.maxWidth}\\,iw):-2`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', settings.crf,
      '-c:a', 'aac', '-b:a', settings.audioBitrate,
      '-movflags', '+faststart',
      outputName,
    ],
  };
}
