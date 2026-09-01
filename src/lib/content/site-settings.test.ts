import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { siteSettingsSchema } from './site-settings';
import { blogEntrySchema } from './blog-entry';

const settings = JSON.parse(
  readFileSync(new URL('../../content/settings/site.json', import.meta.url), 'utf8'),
);

describe('site settings CMS content', () => {
  it('matches the site settings schema', () => {
    expect(siteSettingsSchema.safeParse(settings).success).toBe(true);
  });

  it('uses the production downloader domain as its canonical origin', () => {
    expect(siteSettingsSchema.parse(settings).canonicalOrigin).toBe('https://www.streamnest.io');
  });

  it('contains the CMS-managed site sections required to render the shared layout', () => {
    const parsed = siteSettingsSchema.parse(settings);
    expect(parsed.locale).toMatch(/\S/);
    expect(new URL(parsed.canonicalOrigin).protocol).toBe('https:');
    expect(parsed.themeColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(parsed.themeColorFallback).toMatch(/^#[0-9a-f]{6}$/i);
    expect(parsed.name).toMatch(/\S/);
    expect(parsed.logo).toMatch(/\S/);
    expect(parsed.defaultShareImage).toMatch(/\S/);
    expect(parsed.header.navigation.length).toBeGreaterThan(0);
    expect(parsed.footer.links.length).toBeGreaterThan(0);
    expect(parsed.footer.socialLinks).toEqual([]);
    expect(parsed.uploader.hero.heading).toBeTruthy();
    expect(parsed.uploader.dropzone.fileInputLabel).toBeTruthy();
  });

  it('allows optional HTTPS social links and rejects unsafe social destinations', () => {
    const withSocial = structuredClone(settings);
    withSocial.footer.socialLinks = [{ platform: 'youtube', label: 'YouTube', href: 'https://youtube.com/@streamnest' }];
    expect(siteSettingsSchema.parse(withSocial).footer.socialLinks).toHaveLength(1);

    const unsafe = structuredClone(withSocial);
    unsafe.footer.socialLinks[0].href = 'javascript:alert(1)';
    expect(siteSettingsSchema.safeParse(unsafe).success).toBe(false);
  });

  it('keeps the shared brand neutral across every product mode', () => {
    const parsed = siteSettingsSchema.parse(settings);
    expect(parsed.name).toBe('Streamnest');
    expect(parsed.logo).toBe('/brand-logo.svg');
    expect(parsed.favicon).toBe('/brand-logo.svg');
    expect(parsed.defaultShareImage).toBe('/brand-og-card.svg');
    expect(`${parsed.defaultTitle} ${parsed.defaultDescription} ${parsed.footer.tagline}`)
      .not.toMatch(/download(er|ing)?/i);
  });

  it('requires a canonical HTTPS origin without a path', () => {
    const invalid = structuredClone(settings);
    invalid.canonicalOrigin = 'https://www.watermarkgemini.com/blog';
    expect(siteSettingsSchema.safeParse(invalid).success).toBe(false);
  });

  it('allows analytics to be disabled but rejects malformed measurement IDs', () => {
    const disabled = structuredClone(settings);
    disabled.analytics.googleMeasurementId = '';
    expect(siteSettingsSchema.safeParse(disabled).success).toBe(true);

    const malformed = structuredClone(settings);
    malformed.analytics.googleMeasurementId = 'UA-123';
    expect(siteSettingsSchema.safeParse(malformed).success).toBe(false);
  });

  it('supports one-level dropdown links in the header navigation', () => {
    const dropdownSettings = structuredClone(settings);
    dropdownSettings.header.navigation[0].children = [
      { label: 'Remove logos', href: '/remove-logo-from-image' },
      { label: 'Remove text', href: '/remove-text-from-image' },
    ];

    const parsed = siteSettingsSchema.parse(dropdownSettings);
    expect(parsed.header.navigation[0].children).toHaveLength(2);
  });

  it('defaults legacy blog entries to the downloader product area', () => {
    const parsed = blogEntrySchema.parse({
      slug: 'legacy-guide', title: 'Legacy guide', description: 'Description',
      publishedAt: '2026-08-30', readTime: '5 min read',
    });
    expect(parsed.productArea).toBe('downloader');
  });
});

