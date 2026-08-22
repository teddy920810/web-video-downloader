import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readProjectFile = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

describe('product module boundary', () => {
  it('keeps the downloader entrypoint independent from the legacy watermark runtime', () => {
    const page = readProjectFile('src/pages/index.astro');
    const downloader = readProjectFile('src/components/downloader/UrlDownloader.tsx');
    const runtime = `${page}\n${downloader}`;

    expect(runtime).not.toContain('ImageUploader');
    expect(runtime).not.toContain('MockWatermarkProvider');
    expect(runtime).not.toContain("../lib/services");
  });

  it('retains the legacy watermark provider as an optional module', () => {
    expect(readProjectFile('src/lib/providers/mock-provider.ts')).toContain('export class MockWatermarkProvider');
  });
});
