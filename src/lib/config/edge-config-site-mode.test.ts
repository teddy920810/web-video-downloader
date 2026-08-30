import { describe, expect, it, vi } from 'vitest';
import { createEdgeConfigModeReader } from './edge-config-site-mode';

describe('Edge Config site-mode reader', () => {
  it('returns no reader when a connection string is absent', () => {
    expect(createEdgeConfigModeReader(undefined, vi.fn())).toBeUndefined();
    expect(createEdgeConfigModeReader('  ', vi.fn())).toBeUndefined();
  });

  it('creates one client and reads only the siteMode item', async () => {
    const get = vi.fn().mockResolvedValue('downloader');
    const createClient = vi.fn().mockReturnValue({ get });
    const reader = createEdgeConfigModeReader('https://edge-config.example/ecfg?token=secret', createClient);

    await expect(reader?.()).resolves.toBe('downloader');
    expect(createClient).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledWith('siteMode');
  });
});
