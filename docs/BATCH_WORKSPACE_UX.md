# Batch workspace delivery

Scope: all 11 existing file tools share the same workspace for one or multiple files. Keep the legacy single-file editor accessible explicitly. Preserve CMS content, branding, backend billing and public media.

## Checklist

- [x] Freeze approved queue entries at start; newly added files require another start.
- [x] Keep selection for downloads separate from processing and AI charging.
- [x] Shared file list, active preview, human-readable states and pending settings.
- [x] Images, video and audio use the appropriate preview, with dimensions/duration where supported.
- [x] Named background swatches, transparent checkerboard and selected state.
- [x] Selected/all ZIP download with duplicate-name protection, cancellation and 250 MB packing guard.
- [x] Retain transparent AI outputs for free local recoloring; preview and download use the same output.
- [x] Check AI balance before starting a batch; no automatic partial processing for insufficient balance.
- [x] Confirm discarding results and warn before leaving a non-empty workspace.
- [x] Validate merge ordering/removal and per-file video ranges. JPEG transparency has an explicit fill color.
- [x] Complete unit, browser, accessibility and mobile verification: 318 unit tests, 46 default + 12 utilities browser tests; one optional external-video case skipped. Type/lint/build pass; dependency audit reports zero vulnerabilities.
- [ ] Review protected-content diff, CI and merge main.
- [ ] Verify production tool interactions and actual downloadable artifacts.

## Resource and billing boundaries

Queues are in-tab only: up to 20 tasks, 500 MB inputs and 500 MB retained outputs (including transparent originals). ZIP uses stored media entries and bounded reads; packing itself needs additional browser memory and is capped at 250 MB of selected outputs. Individual downloads remain available above the ZIP limit. Output URLs are revoked on removal/unmount. A download action indicates a request to the browser, not proof of a saved file.

Settings are captured for each explicit queue start. Stop finishes the current task. Paid AI work is never automatically retried after an uncertain outcome; users are directed to account history. Production AI tests require a new allowance when the previously authorized two credits have been exhausted.

ZIP streaming follows the upstream API: https://github.com/101arrowz/fflate#usage . No server or paid processing is involved in packing or recoloring.

## Local acceptance evidence

- The real in-app browser saved `streamnest-results.zip` to disk. Both entries decoded as WebP: 61,286 bytes and 60,410 bytes, each below the requested 60 KiB target.
- Browser tests unzip selected-only and all-result archives, verify actual media outputs and video duration, and verify blue-to-green recoloring without another mocked provider request.
- The 390px layout has no horizontal overflow. File selection is independent of active preview; serious/critical accessibility violations in the shared workspace: zero.
- Development-only Astro audit fetch and pre-existing auth hydration diagnostics were observed; they did not fail the checks. No authentication bootstrap was changed.
- Source/public/CMS/legal content and media: zero changes. No backend, domain, database migration or billing changes.
