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

  it('publishes an authenticated background remover with the shared workspace interaction', () => {
    const page = readProjectFile('src/pages/background-remover.astro');
    const component = readProjectFile('src/components/image/BackgroundRemover.tsx');
    expect(page).toContain('<BackgroundRemover client:only="react"');
    expect(component).toContain('/api/background-remover/upload-url');
    expect(component).toContain('/api/background-remover');
    expect(component).toContain('data-workspace');
    expect(component).toContain('downloadBackgroundResult');
    expect(component).toContain("crossOrigin={resultUrl ? 'anonymous' : undefined}");
  });

  it('shows a self-service test credit grant only through the administrator account API', () => {
    const account = readProjectFile('src/components/account/AccountDashboard.tsx');
    const me = readProjectFile('src/pages/api/me/index.ts');
    expect(account).toContain('/api/admin/test-credits');
    expect(account).toContain('canGrantTestCredits');
    expect(me).toContain('canGrantTestCredits');
  });

  it('expands every selected-file tool into the shared full-width workspace', () => {
    const component = readProjectFile('src/components/media/LocalVideoTool.tsx');
    const css = readProjectFile('src/styles/global.css');
    expect(component).toContain('data-workspace={file ?');
    expect(css).toContain('.utility-hero:has([data-workspace="true"])');
  });

  it('renders the homepage through separate downloader and utilities products', () => {
    const page = readProjectFile('src/pages/index.astro');
    expect(page).toContain('export const prerender = false');
    expect(page).toContain('<DownloaderHome />');
    expect(page).toContain('<UtilitiesHome primaryHeading={utilities} />');
    expect(page).toContain('!utilities && <DownloaderHome />');
  });

  it('uses product icons inside the tools instead of as the shared brand', () => {
    const component = readProjectFile('src/components/media/LocalVideoTool.tsx');
    expect(component).toContain("mode === 'converter' ? '/assets/tools/converter-logo.svg' : mode === 'compressor' ? '/assets/tools/compressor-logo.svg' : null");
    expect(component).toContain('className="local-media-product-icon"');
  });

  it('manages utility page and form copy through Pages CMS', () => {
    const pages = readProjectFile('.pages.yml');
    const config = readProjectFile('src/content.config.ts');
    expect(pages).toContain('name: utilities-settings');
    expect(pages).toContain('path: src/content/settings/utilities.json');
    expect(config).toContain('utilitiesSettingsSchema');
    expect(config).toContain('utilitiesSettings,');
  });

  it('exposes progress, cancellation, errors, and same-origin FFmpeg assets', () => {
    const component = readProjectFile('src/components/media/LocalVideoTool.tsx');
    const overlay = readProjectFile('src/components/shared/ProcessingOverlay.tsx');
    const runtime = readProjectFile('src/lib/media/ffmpeg-runtime.ts');
    const prepareScript = readProjectFile('scripts/prepare-ffmpeg-assets.mjs');
    expect(component).toContain('<ProcessingOverlay');
    expect(overlay).toContain('aria-live="polite"');
    expect(overlay).toContain('aria-busy="true"');
    expect(component).toContain('role="alert"');
    expect(component).toContain('runtime.current?.terminate()');
    expect(runtime).toContain("const CORE_BASE_URL = '/vendor/ffmpeg'");
    expect(runtime).not.toContain('unpkg.com');
    expect(runtime).not.toContain('jsdelivr.net');
    expect(prepareScript).toContain("node_modules', '@ffmpeg', 'core'");
  });

  it('reuses one accessible loading treatment across every processing workspace', () => {
    const background = readProjectFile('src/components/image/BackgroundRemover.tsx');
    const image = readProjectFile('src/components/image/LocalImageTool.tsx');
    const video = readProjectFile('src/components/media/LocalVideoTool.tsx');
    const merger = readProjectFile('src/components/media/VideoMergerTool.tsx');
    const css = readProjectFile('src/styles/global.css');

    for (const component of [background, image, video, merger]) {
      expect(component).toContain('<ProcessingOverlay');
    }
    expect(background).toContain('background-canvas');
    expect(css).toContain('.tool-processing-overlay');
    expect(css).toContain('@keyframes tool-processing-spin');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
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
