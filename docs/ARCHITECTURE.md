# Architecture and product boundaries

This repository contains a reusable site shell plus optional product modules. The current site is the video downloader; legacy watermark code remains available for cloning but is not imported by the downloader entrypoint.

## Reusable site shell

- `src/layouts`, `src/lib/auth.ts`, and `src/components/auth`: layout and Google authentication.
- `src/lib/content`, `src/content.config.ts`, and `scripts`: SEO, CMS schemas, validation, and site initialization.
- `src/styles` and shared settings: presentation primitives and brand configuration.

## Downloader product module

- `src/components/downloader`: browser interaction, cancellation, and task polling.
- `src/pages/api/downloads`: authenticated control-plane routes.
- `src/lib/download` and `src/lib/trials`: URL policy and one-trial persistence.
- `media-download-service` (separate repository): yt-dlp inspection, background processing, and private object storage.

The web API creates a job and returns `202` with `queued`. The browser polls an owner-scoped status route until the service reports `ready` or `failed`.

## Optional legacy watermark module

- `src/components/uploader`, `src/lib/upload`, `src/lib/jobs`, `src/lib/providers`, `src/lib/r2`, and `src/lib/services.ts`.

These files are intentionally retained as a product-module example. The downloader page must not import them. `MockWatermarkProvider` remains unchanged and is not part of the downloader runtime graph.

## Production boundary

The service currently includes an in-memory, cross-platform job store so the state machine can be tested locally. Production multi-instance use requires a durable job adapter and queue (for example Cloud Tasks plus a database-backed store). Creating those cloud resources, assigning IAM, and deploying are user-gated operations and are not represented as complete by this repository.
