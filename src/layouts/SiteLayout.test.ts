import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const layoutSource = readFileSync(new URL('./SiteLayout.astro', import.meta.url), 'utf8');
const globalCss = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');
const uploaderSource = readFileSync(new URL('../components/uploader/ImageUploader.tsx', import.meta.url), 'utf8');
const popupSource = readFileSync(new URL('../pages/auth/popup.astro', import.meta.url), 'utf8');
const notFoundSource = readFileSync(new URL('../pages/404.astro', import.meta.url), 'utf8');
const siteSettings = JSON.parse(
  readFileSync(new URL('../content/settings/site.json', import.meta.url), 'utf8'),
) as { analytics: { googleMeasurementId: string } };

describe('SiteLayout Google Analytics integration', () => {
  it('loads GA4 from site settings and supports disabling it', () => {
    expect(layoutSource).toContain('site.analytics.googleMeasurementId');
    expect(layoutSource).toContain('analyticsId &&');
    expect(layoutSource).toContain('googletagmanager.com/gtag/js?id=${analyticsId}');
    expect(layoutSource).toContain("gtag('config', analyticsId)");
    expect(layoutSource).not.toContain('G-52ZWCGEZ7R');
  });

  it('routes production analytics to the Streamnest GA4 web stream', () => {
    expect(siteSettings.analytics.googleMeasurementId).toBe('G-KSW5SSGK0H');
  });

  it('uses CMS-managed locale, theme color, and structured-data defaults', () => {
    expect(layoutSource).toContain('<html lang={site.locale}>');
    expect(layoutSource).toContain('<meta name="theme-color" content={site.themeColor} />');
    expect(layoutSource).toContain('--theme-color-fallback: ${site.themeColorFallback};');
    expect(globalCss).toContain('--green: color-mix(in srgb, var(--theme-color, var(--theme-color-fallback)) 68%, black);');
    expect(globalCss).not.toContain('--green: #1d6b56;');
    expect(globalCss).toContain('font-family: "Montserrat", system-ui');
    expect(globalCss).toContain('font-size: clamp(3rem, 4vw, 3.5rem);');
    expect(globalCss).toContain('font-size: clamp(2rem, 3vw, 2.25rem);');
    expect(layoutSource).toContain("utilitiesMode ? 'UtilitiesApplication' : site.structuredData.applicationCategory");
    expect(layoutSource).toContain("utilitiesMode ? 'Any browser with WebAssembly support' : site.structuredData.operatingSystem");
    expect(layoutSource).toContain('priceCurrency: site.structuredData.priceCurrency');
  });

  it('queues commands with the official Google tag arguments object', () => {
    expect(layoutSource).toContain('function gtag(){dataLayer.push(arguments);}');
    expect(layoutSource).not.toContain('function gtag(...args)');
  });

  it('renders CMS navigation children as a hover and keyboard dropdown', () => {
    expect(layoutSource).toContain('(item.children?.length ?? 0) > 0');
    expect(layoutSource).toContain('class="nav-dropdown"');
    expect(layoutSource).toContain('class="nav-dropdown-trigger"');
    expect(layoutSource).toContain('(item.children ?? []).map');
    expect(globalCss).toContain('.nav-dropdown:hover .nav-dropdown-panel');
    expect(globalCss).toContain('.nav-dropdown:has(:focus-visible) .nav-dropdown-panel');
    expect(globalCss).toContain('pointer-events: none');
    expect(globalCss).toContain('.site-header nav > a, .nav-dropdown-trigger { font-weight: 750; }');
    expect(globalCss).not.toMatch(/\.nav-dropdown-trigger\s*\{[^}]*font:\s*inherit/);
    expect(globalCss).toMatch(/\.utility-site \.nav-dropdown-panel\s*\{[^}]*color:\s*var\(--ink\)/);
    expect(globalCss).toMatch(/\.download-site \.nav-dropdown-panel\s*\{[^}]*color:\s*var\(--ink\)/);
    expect(layoutSource).toContain("dropdown.addEventListener('pointerleave'");
  });

  it('groups the tools menu and keeps the brand, navigation, and auth columns stable', () => {
    expect(layoutSource).toContain('TOOL_GROUPS.map');
    expect(layoutSource).toContain('class="nav-dropdown-group"');
    expect(layoutSource).toContain('class="nav-dropdown-group-title"');
    expect(globalCss).toMatch(/\.site-header\s*\{[^}]*grid-template-columns:\s*minmax\(170px, 1fr\) auto minmax\(170px, 1fr\)/);
    expect(globalCss).toMatch(/\.header-auth\s*\{[^}]*inline-size:\s*190px/);
    expect(globalCss).toContain('.header-auth-loading');
  });

  it('renders grouped footer columns and hides unconfigured social links', () => {
    expect(layoutSource).toContain('class="footer-tool-groups"');
    expect(layoutSource).toContain('class="footer-link-group"');
    expect(layoutSource).toContain('site.footer.socialLinks.length > 0');
    expect(layoutSource).toContain('class="footer-social-links"');
    expect(layoutSource).toContain('Refund Policy');
    expect(layoutSource).toContain('Privacy Policy');
    expect(layoutSource).toContain('Terms of Use');
    expect(globalCss).toMatch(/\.site-footer\s*\{[^}]*grid-template-columns:\s*minmax\(220px, 1\.15fr\) minmax\(0, 3fr\)/);
  });

  it('renders every brand mark as the CMS-managed logo image', () => {
    const brandSources = [layoutSource, uploaderSource, popupSource].join('\n');
    expect(brandSources).not.toContain('brand-mark');
    expect(layoutSource.match(/<img class="brand-logo"/g)).toHaveLength(2);
    expect(uploaderSource).toContain('<img className="brand-logo auth-logo"');
    expect(popupSource).toContain('<img class="brand-logo"');
  });

  it('uses one neutral CMS brand and keeps authentication in both modes', () => {
    expect(layoutSource).not.toContain('displayLogo');
    expect(layoutSource.match(/src=\{site\.logo\}/g)).toHaveLength(2);
    expect(layoutSource).toContain('showAuth && <div class="header-auth"');
    expect(layoutSource).not.toContain('showAuth && !utilitiesMode');
    expect(globalCss).toMatch(/\.utility-site \.site-header\s*\{[^}]*max-width:\s*none/);
    expect(globalCss).toMatch(/\.utility-site \.site-footer\s*\{[^}]*max-width:\s*none/);
    expect(globalCss).toContain('body.utility-site { background: var(--download-night); }');
  });

  it('keeps light pricing and account cards readable on the dark utility shell', () => {
    expect(globalCss).toMatch(/\.pricing-grid article, \.account-summary > div, \.account-empty, \.account-status, \.account-admin, \.account-usage\s*\{[^}]*color:\s*var\(--ink\)/);
  });

  it('provides an accessible mobile navigation toggle and dropdown state', () => {
    expect(layoutSource).toContain('data-mobile-menu-toggle');
    expect(layoutSource).toContain('aria-controls="site-navigation"');
    expect(layoutSource).toContain('aria-expanded="false"');
    expect(layoutSource).toContain('data-nav-dropdown-trigger');
    expect(layoutSource).toContain("event.key === 'Escape'");
    expect(layoutSource).toContain("header?.addEventListener('click', (event) => event.stopPropagation())");
    expect(layoutSource).toContain("trigger.addEventListener('click', (event) => {");
    expect(layoutSource).toContain('event.stopPropagation();');
    expect(globalCss).toContain('.site-header.is-menu-open nav');
    expect(globalCss).toContain('.nav-dropdown.is-open .nav-dropdown-panel');
    expect(globalCss).toMatch(/@media \(max-width: 900px\)[\s\S]*?\.header-auth\s*\{[^}]*grid-row:\s*1/);
    expect(globalCss).toMatch(/@media \(max-width: 900px\)[\s\S]*?\.mobile-menu-toggle\s*\{[^}]*grid-row:\s*1/);
    expect(globalCss).toMatch(/@media \(max-width: 900px\)[\s\S]*?\.download-site \.site-header\s*\{[^}]*height:\s*auto/);
  });

  it('lets the browser infer the CMS favicon media type', () => {
    expect(layoutSource).toContain('<link rel="icon" href={site.favicon} />');
    expect(layoutSource).not.toContain('type="image/svg+xml"');
  });

  it('uses CMS-managed copy throughout the shared upload component', () => {
    expect(uploaderSource).toContain('copy.hero.heading');
    expect(uploaderSource).toContain('copy.dropzone.dropLabel');
    expect(uploaderSource).toContain('copy.result.downloadButton');
    expect(uploaderSource).toContain('copy.auth.continueButton');
    expect(uploaderSource).not.toContain('Drop your image here');
  });

  it('keeps utility and error pages out of search results', () => {
    expect(layoutSource).toContain('<meta name="robots" content="noindex, follow" />');
    expect(notFoundSource).toContain('noindex={true}');
    expect(popupSource).toContain('<meta name="robots" content="noindex, nofollow" />');
  });
});

