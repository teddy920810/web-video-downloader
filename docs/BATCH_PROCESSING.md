# Batch processing and target-size compression

## Delivery checklist

- [x] Serial queue with distinct task IDs, queued/processing/ready/failed states, stop-after-current and per-result download/removal.
- [x] All 11 current file tools accept multiple files and drops. Existing single-file controls remain available.
- [x] Video merging queues groups (2–10 clips per task), not individual clips.
- [x] Image and video compressors accept optional target size in binary KB/MB (1024 bytes / 1024² bytes).
- [x] Target compression verifies final bytes and rejects oversized results; no truncation or false success.
- [x] AI queue preserves authentication, server credit checks and one-credit-per-success billing; no automatic AI POST retry.
- [x] Full local verification: 310 unit tests, 55 browser tests; one optional external real-video case skipped. Lint/type checks/build and dependency audit pass.
- [ ] Production acceptance (record final evidence in PR/task).

## Behavior and boundaries

Choose multiple files to enter the queue automatically, or use **Batch processing** to add tasks individually. Dropping files into any file tool enters the same queue. The SVG tool supports local SVG files in batch; its existing code and URL controls remain available in single mode. The optional URL downloader is not a file-upload tool and its one-use account policy is unchanged.

Queues exist only in the current tab. Closing or reloading loses queued files and local results. One task runs at a time; active settings are frozen. Adding files while processing uses the settings captured when Start queue was clicked. Stop after current completes that task (especially important for paid AI work) and leaves the rest queued. Start queue resumes pending tasks without re-running completed or failed tasks. Explicitly add a file again for a new attempt; interrupted AI results should first be checked in Account.

Limits: 20 tasks, 500 MB total retained source files, 500 MB retained results. Existing individual image/video/AI/SVG validation remains enforced. Each merge group has 2–10 clips totaling at most 250 MB. Remove completed tasks to release object URLs and memory. FFmpeg workers terminate after each attempt. Result filenames include a queue ID and original stem to prevent collisions.

## Compression contract

- Blank target uses the existing quality/preset path.
- Image target mode searches WebP quality with at most nine encodes, from 90% down to 5%, retaining the highest tested candidate under the target. Dimensions stay unchanged. Impossible targets report an error and suggest resizing or a larger target. Single-mode slider/landing copy describes the ordinary 35–90% mode; target mode has an explicit quality-reduction notice.
- Video target mode needs readable browser duration metadata. It budgets video bitrate, one optional audio track at 32 kbps and mux overhead, and may reduce resolution to at most 854 pixels wide. It verifies output bytes and performs at most one corrective encode. It never uses `-fs` or cuts duration to fit. Unsupported metadata, impossibly small bitrates or still-oversized output produce explicit errors instead of a download marked successful.
- Target is an upper bound, not a promise to pad the file to an exact byte count or preserve identical quality.

## Verification

Unit tests: serial exclusivity, duplicate starts, stop/resume, removal, capacity, failure isolation, size validation, bounded image quality search and video bitrate budget/no truncation.

Browser tests: all 11 drag/drop surfaces; real Canvas processing for image conversion/compression/resizing and SVG; real WASM queued conversion/compression/trimming/audio/GIF/merge; downloaded bytes and video duration; impossible-target failure; mocked AI sequencing/stop/resume and blue pixels in exported PNG. AI mocks never contact Replicate. Fixture `tests/fixtures/batch-video.webm` is a generated one-second test pattern with sine audio, not user or marketing content. Runtime application code and test execution do not depend on a platform-specific FFmpeg installation.

No operational CMS values, public images, legal/SEO copy, domains, OAuth bootstrap, server APIs, backend infrastructure or subscription policy changed.

## Release dependency maintenance

The existing lockfile failed the release audit on 2026-09-12. Upgrade Astro to the minimum patched 7.2.8 (pinned), Sharp to 0.35.4, SVGO to 4.1.0, js-yaml to 4.3.2 and Vitest/coverage to 4.1.11. Keep the existing major versions. The resulting font dependency requires Node >=22.19; development can also use Node 24, while CI continues using current Node 22.

Sources: https://github.com/advisories/GHSA-26w7-cxv4-gfx2 , https://github.com/advisories/GHSA-2883-xcg3-v3hh , https://github.com/advisories/GHSA-w27v-7q3p-w38r . `npm audit --audit-level=high` is the release gate, not an assertion that every advisory is exploitable in this application.

Browser tests run with two workers and a 15-second assertion timeout to bound concurrent WASM memory and allow initial hydration on slower CI machines. Existing account/consent assertions are retained.
