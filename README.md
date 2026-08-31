# Streamnest Media Tools

An Astro and React media-tool product with browser-local video and image utilities, an authenticated AI background remover, and an optional eligible-public-video trial. The product-mode switch can hide all downloader surfaces while preserving the common brand, Google sign-in, accounts, credits, legal pages, and media tools.

## Product surfaces

- Browser-local: video conversion, compression, trimming, merging, audio extraction, video-to-GIF, image conversion, image compression, and image resizing.
- Cloud AI: background removal through the private Vercel → Cloud Run → Replicate flow. One successful result uses one AI credit; provider failures refund the reservation.
- Account: Google identity, Free/Pro entitlement model, welcome credit, wallet, immutable credit ledger, and recent usage.
- Pricing: current Free benefits and truthful Coming Soon paid plans. Checkout is intentionally disabled until the payment phase.

## Trial policy

- One successful download per Google account.
- Individual public videos only; no playlists, private media, live streams, DRM, cookies, or access-control bypasses.
- Maximum 720p, 10 minutes, and 500 MB.
- Temporary output is stored in a private Cloudflare R2 bucket.

## Architecture

```text
Browser -> Astro/Vercel -> Google Auth + Neon
                         -> browser-local FFmpeg/Canvas tools (no upload)
                         -> credit reserve/consume/refund ledger
                         -> private Cloud Run background-removal service
                         -> authenticated Cloud Run yt-dlp service
                         -> private R2 -> 15-minute signed download URL
```

The browser never receives database, object-storage, or internal service credentials.

## Local development

Requires Node.js 22 or later.

```sh
npm ci
cp .env.example .env.local
npm run db:migrate
npm run dev -- --port 4322
```

On Windows, copy `.env.example` to `.env.local` using File Explorer or PowerShell. Populate credentials locally and never commit `.env.local` or `.secrets/`.

The companion backend is [media-download-service](https://github.com/teddy920810/media-download-service).

## Verification

```sh
npm run verify
npm run db:verify
```

Production deployment uses Vercel for the Astro application and Google Cloud Run for the containerized media service.
