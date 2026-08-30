import { describe, expect, it, vi } from 'vitest';
import { createSiteModeResolver, parseSiteMode, resolveSiteMode } from './site-mode';

describe('site mode resolution', () => {
  it('accepts only explicit mode names', () => {
    expect(parseSiteMode('downloader')).toBe('downloader');
    expect(parseSiteMode('utilities')).toBe('utilities');
    expect(parseSiteMode('true')).toBeNull();
    expect(parseSiteMode(undefined)).toBeNull();
  });

  it('uses a valid local override outside production', async () => {
    const readRemote = vi.fn();
    await expect(resolveSiteMode({ production: false, localOverride: 'utilities', readRemote })).resolves.toBe('utilities');
    expect(readRemote).not.toHaveBeenCalled();
  });

  it('uses Edge Config in production and ignores a local override', async () => {
    const readRemote = vi.fn().mockResolvedValue('downloader');
    await expect(resolveSiteMode({ production: true, localOverride: 'utilities', readRemote })).resolves.toBe('downloader');
  });

  it.each([undefined, 'invalid'])('fails closed to utilities for a missing or invalid production value', async (value) => {
    await expect(resolveSiteMode({ production: true, readRemote: vi.fn().mockResolvedValue(value) })).resolves.toBe('utilities');
  });

  it('fails closed to utilities when the production reader fails', async () => {
    await expect(resolveSiteMode({ production: true, readRemote: vi.fn().mockRejectedValue(new Error('offline')) })).resolves.toBe('utilities');
  });

  it('briefly caches a resolved mode to avoid repeated remote reads', async () => {
    let now = 1_000;
    const readRemote = vi.fn().mockResolvedValue('downloader');
    const getMode = createSiteModeResolver({ production: true, readRemote, now: () => now, ttlMs: 2_000 });
    await expect(getMode()).resolves.toBe('downloader');
    await expect(getMode()).resolves.toBe('downloader');
    expect(readRemote).toHaveBeenCalledOnce();
    now = 3_001;
    await getMode();
    expect(readRemote).toHaveBeenCalledTimes(2);
  });
});
