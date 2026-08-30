# Site mode contract

The production site supports two explicit modes. The internal mode key is `siteMode`; the product-facing name for `utilities` is “三好学生”. Existing downloader content and assets remain in the repository and are restored when the mode returns to `downloader`.

## Modes

| Surface | `downloader` | `utilities` (“三好学生”) |
|---|---|---|
| `/` | Downloader homepage | Local video utilities homepage |
| `/video-converter` | Available | Available |
| `/video-compressor` | Available | Available |
| `/api/downloads/**` | Available under the existing policy | `404` before any upstream request |
| `/blog` and `/blog/**` | Available | `404` and omitted from discovery |
| Downloader navigation, CTA, sign-in | Visible where currently defined | Not rendered |
| `robots.txt` | Current public policy | Download and blog routes disallowed |
| `sitemap.xml` | Current public routes | Utilities, privacy, and terms only |
| Cloud Run, Decodo, download R2 flow | Reachable through private web APIs | Never called by a public request |

The legal, privacy, and not-found pages remain available in both modes. Static downloader source files are retained; the public runtime boundary is enforced by route handling rather than destructive content changes.

## Resolution and safe fallback

1. A valid local/test `SITE_MODE` override wins outside production.
2. Production reads `siteMode` from Vercel Global Config (formerly Edge Config) through the server-only `EDGE_CONFIG` connection string.
3. A missing, invalid, or failed production remote read resolves to `utilities`.
4. Local development without mode configuration resolves to `downloader`.

Only `downloader` and `utilities` are valid values. A boolean such as `DISABLE_DOWNLOADS` is intentionally avoided because inverted flags are easy to operate incorrectly.

## Browser utility boundary

Video conversion and compression operate entirely in the browser with a lazily loaded FFmpeg WebAssembly runtime. Selected media is not sent to this application, Cloud Run, R2, Decodo, analytics, or authentication APIs. Closing or reloading the page cancels processing. The first release supports a deliberately small format and quality matrix and directs unsuitable large or resource-intensive work to the future desktop product.

## Cache and activation contract

Mode-dependent routes are rendered on demand. Responses declare private/no-store caching so a previous mode cannot remain in a shared CDN cache. Vercel Global Config is the production source of truth and changing one `siteMode` item must not require a source commit or redeployment. The application uses the official `@vercel/edge-config` SDK because that remains the package name for Global Config connections.

The production resource is named `streamnest-site-mode` and contains one item:

```text
siteMode = downloader | utilities
```

Keep separate read tokens for Production and Preview. The `EDGE_CONFIG` variable is server-only and must never use a public client prefix or be committed to an environment file.

## Release contract

Both modes have separate automated browser coverage. A utilities-mode release must prove that downloader HTML and discovery links are absent, every `/api/downloads/**` route is blocked before fetch, local conversion/compression pages remain usable, and no trial download is consumed during verification.
