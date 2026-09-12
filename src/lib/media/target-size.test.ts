import { describe, expect, it } from 'vitest';
import { encodeUnderTarget, targetBytes, buildTargetVideoPlan } from './target-size';

describe('target size compression', () => {
  it('validates size including blank, zero, infinity and units', () => {
    expect(targetBytes('100', 'KB')).toBe(102400);
    expect(targetBytes('1.5', 'MB')).toBe(1572864);
    for (const value of ['', '0', '-1', 'NaN', 'Infinity']) expect(() => targetBytes(value, 'KB')).toThrow();
  });
  it('returns only an output within the target and makes bounded attempts', async () => {
    let attempts = 0;
    const blob = await encodeUnderTarget(600, async quality => { attempts++; return new Blob([new Uint8Array(Math.ceil(quality * 1000))]); });
    expect(blob.size).toBeLessThanOrEqual(600);
    expect(blob.size).toBeGreaterThan(500);
    expect(attempts).toBeLessThanOrEqual(9);
  });
  it('does not pretend an impossible result meets the target', async () => {
    await expect(encodeUnderTarget(20, async () => new Blob([new Uint8Array(50)]))).rejects.toThrow(/target/i);
  });
  it('budgets video plus audio and mux overhead without truncating duration', () => {
    const plan = buildTargetVideoPlan('test.mp4', 1024 * 1024, 60);
    expect(plan.args).toContain('-b:v');
    expect(plan.args).not.toContain('-fs');
    expect(plan.args).not.toContain('-t');
    const bitrate = Number(plan.args[plan.args.indexOf('-b:v') + 1]);
    expect((bitrate + 32000) * 60 / 8).toBeLessThan(1024 * 1024);
    for (const duration of [0, NaN, Infinity]) expect(() => buildTargetVideoPlan('a.mp4', 1000, duration)).toThrow();
    expect(() => buildTargetVideoPlan('a.mp4', 1000, 600)).toThrow(/target/i);
  });
});
