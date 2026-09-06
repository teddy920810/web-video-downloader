# Image Compressor content delivery

Source: user-provided `streamnest-image-compressor-seo-copy-final.docx` and
`streamnest-image-compressor-feature-assets.zip`, received 2026-09-06.
Scope: `/image-compressor` only. Background Remover and Image Resizer are deferred.

## Mapping

- SEO and hero: `src/content/settings/utilities.json`, compressor entry only.
- Upload panel: existing interactive compressor; updated heading and choose label.
- Input/quality/output/privacy helper copy: existing notes panel.
- Features: three original WebP illustrations, unchanged bytes and filenames,
  alternating desktop rows and stacked mobile rows, lazy loading and intrinsic dimensions.
- Three steps, quality/format guide, use cases, six FAQs, final tool anchor:
  `src/content/tool-guides/image-compressor.json`.
- Optional images, supporting sections and CTA are editable in Pages CMS;
  other tool guides render their existing content unchanged.

## Editorial exclusions

Research logs, keyword volume tables, yellow SEO highlighting, HOLD candidates,
editor notes and implementation instructions are not public content.
The source's “link to Image Converter” instruction becomes a real internal link
in the format guide. The free-use FAQ retains the free-tool statement without
the editorial instruction about unverified claims. No batch, target-size,
unlimited-use, no-watermark or no-loss promise is added.

The functional compressor remains browser-local, 35–90% quality, WebP output,
JPG/PNG/WebP input up to 50 MB. No cloud, billing, authentication, credits,
provider settings or processing algorithm changes are included.

Local acceptance also exposed a hostname-routing failure: two pre-existing
consent tests use `www.streamnest.io:4391` mapped to loopback. A test-only route
now explicitly serves that alias from local Astro while retaining the browser
hostname and all consent assertions. It does not alter system proxy settings,
production routing, authentication or analytics integration code.

## Acceptance

- [x] Red content/schema regression tests captured before implementation.
- [x] Exact source paragraph mapping for Features, steps and supporting copy.
- [x] Supplied illustrations inspected, copied without re-encoding.
- [x] Full repository verification: 303 unit tests, 30 default browser tests,
  12 utilities browser tests; one optional external-video fixture skipped.
- [x] Dependency audit: zero known vulnerabilities.

PR checks, main merge identity, Vercel deployment and real production download
are recorded in the associated release PR and task acceptance report.

The legacy README smoke command does not exist in package.json. This release
uses scoped browser acceptance of the real image compressor instead; it does
not invoke R2 or a paid AI job.
