import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { createResultArchive } from './archive';

describe('selected result archive', () => {
  it('includes only the supplied selection, sanitizes paths and preserves duplicate names', async () => {
    const blob = await createResultArchive([
      { name: '../same.png', blob: new Blob(['first']) },
      { name: '../same.png', blob: new Blob(['second']) },
    ]);
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(files)).toEqual(['same.png', 'same (2).png']);
    expect(Object.values(files).map(bytes => strFromU8(bytes))).toEqual(['first', 'second']);
    expect(blob.type).toBe('application/zip');
  });
  it('rejects empty selection and oversized packing before reading files', async () => {
    await expect(createResultArchive([])).rejects.toThrow(/Select/);
    await expect(createResultArchive([{ name: 'large', blob: new Blob(['abc']) }], { maxBytes: 2 })).rejects.toThrow(/smaller/);
  });
  it('cancels packing without destroying the reusable result', async () => {
    const file = { name: 'safe.txt', blob: new Blob(['safe']) };
    const controller = new AbortController(); controller.abort();
    await expect(createResultArchive([file], { signal: controller.signal })).rejects.toThrow(/cancel/i);
    expect(await file.blob.text()).toBe('safe');
  });
});
