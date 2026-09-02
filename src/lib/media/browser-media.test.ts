import { describe, expect, it } from 'vitest';
import {
  buildCompressionPlan,
  buildConversionPlan,
  buildAudioExtractionPlan,
  buildGifPlan,
  buildMergePlan,
  buildTrimPlan,
  assessBrowserMediaRisk,
  buildCompressionPlanAttempts,
  buildConversionPlanAttempts,
  buildMergePlanAttempts,
  buildTrimPlanAttempts,
  describeBrowserMediaError,
  validateLocalVideo,
  type LocalVideoMetadata,
} from './browser-media';

const validVideo: LocalVideoMetadata = {
  name: 'holiday.mov',
  size: 24 * 1024 * 1024,
  type: 'video/quicktime',
};

describe('browser-local media conversion', () => {
  it('accepts a supported local video without requiring a network destination', () => {
    expect(validateLocalVideo(validVideo)).toEqual({ ok: true });
  });

  it('rejects non-video and oversized files before loading FFmpeg', () => {
    expect(validateLocalVideo({ ...validVideo, type: 'image/png' })).toMatchObject({ ok: false });
    expect(validateLocalVideo({ ...validVideo, size: 251 * 1024 * 1024 })).toMatchObject({ ok: false });
  });

  it.each([
    ['mp4', 'converted.mp4', ['-c:v', 'libx264', '-c:a', 'aac']],
    ['webm', 'converted.webm', ['-c:v', 'libvpx', '-c:a', 'libopus']],
    ['mp3', 'converted.mp3', ['-vn', '-c:a', 'libmp3lame']],
  ] as const)('builds a bounded %s conversion plan', (target, outputName, requiredArgs) => {
    const plan = buildConversionPlan(validVideo.name, target);

    expect(plan.outputName).toBe(outputName);
    expect(plan.mimeType).toBe(target === 'mp3' ? 'audio/mpeg' : `video/${target}`);
    expect(plan.args[0]).toBe('-i');
    expect(plan.args[1]).toBe(plan.inputName);
    for (const argument of requiredArgs) expect(plan.args).toContain(argument);
    expect(plan.args.at(-1)).toBe(outputName);
  });

  it('keeps WebM conversion within a browser-safe video budget', () => {
    const plan = buildConversionPlan(validVideo.name, 'webm');

    expect(plan.args).toContain('libvpx');
    expect(plan.args).not.toContain('libvpx-vp9');
    expect(plan.args).toContain('scale=min(1280\\,iw):-2');
    expect(plan.args).toContain('-threads');
    expect(plan.args).toContain('1');
  });

  it('turns WebAssembly memory failures into a useful recovery message', () => {
    expect(describeBrowserMediaError(new WebAssembly.RuntimeError('memory access out of bounds')))
      .toBe('This video is too demanding for browser conversion. Try a shorter or lower-resolution file, or choose MP3.');
    expect(describeBrowserMediaError(new Error('codec unavailable'))).toBe('codec unavailable');
    expect(describeBrowserMediaError(new Event('error')))
      .toBe('The local media engine could not start in this browser.');
  });

  it('classifies browser workload risk from size, duration, and decoded frame dimensions', () => {
    expect(assessBrowserMediaRisk({ size: 20 * 1024 * 1024, durationSeconds: 60, width: 1280, height: 720 }).level)
      .toBe('standard');
    expect(assessBrowserMediaRisk({ size: 90 * 1024 * 1024, durationSeconds: 16 * 60, width: 1920, height: 1080 }).level)
      .toBe('elevated');
    expect(assessBrowserMediaRisk({ size: 170 * 1024 * 1024, durationSeconds: 35 * 60, width: 3840, height: 2160 }).level)
      .toBe('high');
  });

  it('uses a stream-copy fast path for compatible containers and one conservative retry plan', () => {
    const attempts = buildConversionPlanAttempts('holiday.mov', 'mp4', { level: 'elevated', reasons: [] });

    expect(attempts).toHaveLength(2);
    expect(attempts[0].args).toContain('copy');
    expect(attempts[0].args).not.toContain('libx264');
    expect(attempts[1].args).toContain('libx264');
    expect(attempts[1].args).toContain('ultrafast');
    expect(attempts[1].args).toContain('scale=min(1280\\,iw):-2');
    expect(attempts[1].args).toContain('1');
  });

  it('keeps an encode-first conversion bounded and provides a lower-memory retry', () => {
    const attempts = buildConversionPlanAttempts('camera.mkv', 'webm', { level: 'high', reasons: [] });

    expect(attempts[0].args).toContain('libvpx');
    expect(attempts[1].args).toContain('scale=min(854\\,iw):-2');
    expect(attempts[1].args).toContain('96k');
  });
});

describe('browser-local media compression', () => {
  it.each([
    ['small', '32', '854'],
    ['balanced', '28', '1280'],
    ['quality', '24', '1920'],
  ] as const)('builds a bounded %s compression plan', (preset, crf, maxWidth) => {
    const plan = buildCompressionPlan(validVideo.name, preset);

    expect(plan.outputName).toBe(`compressed-${preset}.mp4`);
    expect(plan.mimeType).toBe('video/mp4');
    expect(plan.args).toContain('libx264');
    expect(plan.args).toContain(crf);
    expect(plan.args).toContain(`scale=min(${maxWidth}\\,iw):-2`);
    expect(plan.args.at(-1)).toBe(plan.outputName);
  });

  it('provides a single high-risk compatibility retry for compression', () => {
    const attempts = buildCompressionPlanAttempts(validVideo.name, 'quality', { level: 'high', reasons: [] });
    expect(attempts).toHaveLength(2);
    expect(attempts[0].args).toContain('scale=min(1920\\,iw):-2');
    expect(attempts[1].args).toContain('scale=min(854\\,iw):-2');
    expect(attempts[1].args).toContain('ultrafast');
  });
});

describe('additional browser-local media tools', () => {
  it('builds a bounded trim plan', () => {
    const plan = buildTrimPlan(validVideo.name, { startSeconds: 2, endSeconds: 8 });
    expect(plan.args).toContain('2');
    expect(plan.args).toContain('6');
    expect(plan.outputName).toBe('trimmed.mp4');
  });

  it('tries copy-first trim and merge before their safe transcode fallback', () => {
    const risk = { level: 'standard', reasons: [] } as const;
    const trim = buildTrimPlanAttempts(validVideo.name, { startSeconds: 2, endSeconds: 8 }, risk);
    const merge = buildMergePlanAttempts(['one.mp4', 'two.mp4'], risk);

    expect(trim[0].args).toContain('copy');
    expect(trim[1].args).toContain('libx264');
    expect(merge[0].args).toContain('copy');
    expect(merge[1].args).toContain('libx264');
  });

  it('builds audio and GIF plans', () => {
    expect(buildAudioExtractionPlan(validVideo.name, 'mp3')).toMatchObject({ outputName: 'audio.mp3', mimeType: 'audio/mpeg' });
    expect(buildAudioExtractionPlan(validVideo.name, 'wav')).toMatchObject({ outputName: 'audio.wav', mimeType: 'audio/wav' });
    const gif = buildGifPlan(validVideo.name, { startSeconds: 0, durationSeconds: 5, width: 640 });
    expect(gif.outputName).toBe('clip.gif');
    expect(gif.args.join(' ')).toContain('fps=12');
  });

  it('builds a local merge plan for bounded compatible clips', () => {
    const plan = buildMergePlan(['one.mp4', 'two.mp4']);
    expect(plan.inputNames).toHaveLength(2);
    expect(plan.supportFiles?.[0]?.name).toBe('concat.txt');
    expect(plan.outputName).toBe('merged.mp4');
  });
});
