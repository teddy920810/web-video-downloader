import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readProjectFile(path: string) {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
}

describe('browser-local media tools', () => {
  it('publishes an on-demand converter page backed by the local tool island', () => {
    const page = readProjectFile('src/pages/video-converter.astro');
    expect(page).toContain('export const prerender = false');
    expect(page).toContain('<LocalVideoTool client:only="react" mode="converter"');
  });

  it('selects local video files and loads the media runtime only on demand', () => {
    const component = readProjectFile('src/components/media/LocalVideoTool.tsx');
    expect(component).toContain('type="file"');
    expect(component).toContain('accept="video/*"');
    expect(component).toContain("import('../../lib/media/ffmpeg-runtime')");
    expect(component).not.toContain('/api/');
    expect(component).not.toContain('fetch(');
  });

  it('publishes an on-demand compressor page using the same private browser boundary', () => {
    const page = readProjectFile('src/pages/video-compressor.astro');
    expect(page).toContain('export const prerender = false');
    expect(page).toContain('<LocalVideoTool client:only="react" mode="compressor"');
  });

  it('renders the homepage through separate downloader and utilities products', () => {
    const page = readProjectFile('src/pages/index.astro');
    expect(page).toContain('export const prerender = false');
    expect(page).toContain('<DownloaderHome />');
    expect(page).toContain('<UtilitiesHome />');
  });

  it('exposes progress, cancellation, errors, and same-origin FFmpeg assets', () => {
    const component = readProjectFile('src/components/media/LocalVideoTool.tsx');
    const runtime = readProjectFile('src/lib/media/ffmpeg-runtime.ts');
    const prepareScript = readProjectFile('scripts/prepare-ffmpeg-assets.mjs');
    expect(component).toContain('aria-live="polite"');
    expect(component).toContain('role="alert"');
    expect(component).toContain('runtime.current?.terminate()');
    expect(runtime).toContain("const CORE_BASE_URL = '/vendor/ffmpeg'");
    expect(runtime).not.toContain('unpkg.com');
    expect(runtime).not.toContain('jsdelivr.net');
    expect(prepareScript).toContain("node_modules', '@ffmpeg', 'core'");
  });

  it('isolates downloader and utilities browser suites on separate owned ports', () => {
    const downloader = readProjectFile('playwright.config.ts');
    const utilities = readProjectFile('playwright.utilities.config.ts');
    expect(downloader).toContain("SITE_MODE: 'downloader'");
    expect(downloader).toContain('reuseExistingServer: false');
    expect(utilities).toContain("SITE_MODE: 'utilities'");
    expect(utilities).toContain('127.0.0.1:4392');
    expect(utilities).toContain('reuseExistingServer: false');
    expect(utilities).toContain("testMatch: 'utilities-mode.spec.ts'");
  });
});
