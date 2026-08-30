import { describe, expect, it } from 'vitest';
import {
  buildCompressionPlan,
  buildConversionPlan,
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
    ['webm', 'converted.webm', ['-c:v', 'libvpx-vp9', '-c:a', 'libopus']],
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
});
