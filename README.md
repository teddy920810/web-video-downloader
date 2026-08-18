# Web Video Downloader

An Astro and React web trial for downloading eligible public videos from supported platforms. Users sign in with Google, analyze a single public URL, choose an audio-ready format, and receive a short-lived private download link.

## Trial policy

- One successful download per Google account.
- Individual public videos only; no playlists, private media, live streams, DRM, cookies, or access-control bypasses.
- Maximum 720p, 10 minutes, and 500 MB.
- Temporary output is stored in a private Cloudflare R2 bucket.

## Architecture

```text
Browser -> Astro/Vercel -> Google Auth + Neon
                         -> authenticated Cloud Run yt-dlp service
                         -> private R2 -> 15-minute signed download URL
```

The browser never receives database, object-storage, or internal service credentials.

## Local development

Requires Node.js 22 or later.

```sh
npm ci
cp .env.example .env.local
npm run dev -- --port 4322
```

On Windows, copy `.env.example` to `.env.local` using File Explorer or PowerShell. Populate credentials locally and never commit `.env.local` or `.secrets/`.

The companion backend is [media-download-service](https://github.com/teddy920810/media-download-service).

## Verification

```sh
npm run verify
```

Production deployment uses Vercel for the Astro application and Google Cloud Run for the containerized media service.
