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
  inputNames?: string[];
  outputName: string;
  mimeType: string;
  args: string[];
  supportFiles?: Array<{ name: string; content: string }>;
};

export type LocalVideoValidation = { ok: true } | { ok: false; message: string };

const BROWSER_MEMORY_ERROR = /memory access out of bounds|out of memory|memory allocation/i;

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

export function describeBrowserMediaError(cause: unknown) {
  const detail = cause instanceof Error ? cause.message : String(cause ?? '');
  if (BROWSER_MEMORY_ERROR.test(detail)) {
    return 'This video is too demanding for browser conversion. Try a shorter or lower-resolution file, or choose MP3.';
  }
  return detail && detail !== '[object Event]'
    ? detail
    : 'The local media engine could not start in this browser.';
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
        '-vf', 'scale=min(1280\\,iw):-2',
        '-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-threads', '1',
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

export function buildTrimPlan(inputFileName: string, options: { startSeconds: number; endSeconds: number }): MediaPlan {
  if (!Number.isFinite(options.startSeconds) || options.startSeconds < 0) throw new Error('Start time must be zero or greater.');
  if (!Number.isFinite(options.endSeconds) || options.endSeconds <= options.startSeconds) throw new Error('End time must be after the start time.');
  const duration = options.endSeconds - options.startSeconds;
  const inputName = safeInputName(inputFileName);
  return {
    inputName,
    outputName: 'trimmed.mp4',
    mimeType: 'video/mp4',
    args: ['-ss', String(options.startSeconds), '-i', inputName, '-t', String(duration), '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-movflags', '+faststart', 'trimmed.mp4'],
  };
}

export function buildAudioExtractionPlan(inputFileName: string, target: 'mp3' | 'wav'): MediaPlan {
  const inputName = safeInputName(inputFileName);
  if (target === 'wav') {
    return { inputName, outputName: 'audio.wav', mimeType: 'audio/wav', args: ['-i', inputName, '-vn', '-c:a', 'pcm_s16le', 'audio.wav'] };
  }
  return { inputName, outputName: 'audio.mp3', mimeType: 'audio/mpeg', args: ['-i', inputName, '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', 'audio.mp3'] };
}

export function buildGifPlan(inputFileName: string, options: { startSeconds: number; durationSeconds: number; width: number }): MediaPlan {
  if (!Number.isFinite(options.startSeconds) || options.startSeconds < 0) throw new Error('Start time must be zero or greater.');
  if (!Number.isFinite(options.durationSeconds) || options.durationSeconds <= 0 || options.durationSeconds > 30) throw new Error('GIF duration must be between 1 and 30 seconds.');
  if (!Number.isInteger(options.width) || options.width < 160 || options.width > 1280) throw new Error('GIF width must be between 160 and 1280 pixels.');
  const inputName = safeInputName(inputFileName);
  const filter = `fps=12,scale=${options.width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;
  return {
    inputName,
    outputName: 'clip.gif',
    mimeType: 'image/gif',
    args: ['-ss', String(options.startSeconds), '-t', String(options.durationSeconds), '-i', inputName, '-filter_complex', filter, '-loop', '0', 'clip.gif'],
  };
}

export function buildMergePlan(inputFileNames: string[]): MediaPlan {
  if (inputFileNames.length < 2 || inputFileNames.length > 10) throw new Error('Choose between 2 and 10 clips.');
  const inputNames = inputFileNames.map((name, index) => {
    const extension = extensionOf(name);
    return `clip-${index}.${extension || 'mp4'}`;
  });
  const manifest = inputNames.map((name) => `file '${name.replaceAll("'", "'\\''")}'`).join('\n');
  return {
    inputName: inputNames[0],
    inputNames,
    outputName: 'merged.mp4',
    mimeType: 'video/mp4',
    supportFiles: [{ name: 'concat.txt', content: manifest }],
    args: ['-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-movflags', '+faststart', 'merged.mp4'],
  };
}
