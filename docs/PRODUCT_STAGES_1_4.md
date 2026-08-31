# Product stages 1–4

## 1. Product base and compliance mode

- One neutral Streamnest brand, shared account, legal, SEO, and layout layer.
- `utilities` mode hides downloader routes, APIs, and downloader-only blog posts.
- `downloader` mode exposes the complete product without duplicating the common tools.

## 2. Low-cost online tools

- Local FFmpeg/Canvas tools: converter, compressor, trimmer, merger, audio extractor, video-to-GIF, image converter, image compressor, and image resizer.
- Cloud AI tool: background remover. Object Cleanup, watermark removal, and AI enhancement are not included.
- Analytics events contain only tool ID, processing boundary, and outcome; filenames and media are excluded.

## 3. Free and future Pro value

- Free users receive browser-local tools, a 250 MB local-file allowance, and one welcome AI credit.
- The Pro model reserves 100 credits and a 1 GB local-file allowance, but checkout remains disabled and marked Coming Soon.
- No redirect, button, or plan label grants a paid entitlement.

## 4. Accounts and credits

- Google claims create or update the account profile and its wallet; OAuth tokens are not persisted.
- Cloud AI uses an atomic `reserve -> consume` flow and an idempotent `reserve -> refund` failure flow.
- `/account` shows plan, credit balance, and recent AI usage. `/api/admin/summary` fails closed unless `ADMIN_EMAILS` explicitly allowlists the signed-in address.
- Apply `npm run db:migrate` before release and run `npm run db:verify` against the target Neon database.

Payments, subscriptions, support operations, Desktop downloads, and license activation belong to stages 5–6 and are intentionally excluded.
