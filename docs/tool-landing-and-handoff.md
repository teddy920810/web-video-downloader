# Tool landing sections and local handoff

## This release

- [x] Read reference layout; preserve existing Hero markup, tool runtime, utilities CMS values and all media assets.
- [x] Red content/browser tests; capture approved Hero and CMS snapshots before changes.
- [x] Per-tool Features, three steps and FAQ content for all 11 existing utility routes.
- [x] Shared Astro rendering, alternating feature/fact panels, numbered steps, native accessible FAQ disclosure.
- [x] Separate editable Pages CMS collection; creation/rename/delete disabled for these route-bound guides.
- [x] Focused content tests, all-tool browser tests, mobile overflow/keyboard checks and desktop visual inspection.
- [x] Full verification after isolating the original Hero container: 301 unit tests, static checks/build, 25 browser tests and 8 utilities tests passed. One optional external sample-video test skipped. Dependency audit: zero vulnerabilities. Hero and existing CMS snapshots unchanged.
- [ ] PR/CI/main deployment and production functionality checks.

Reference: https://online.hitpaw.com/online-video-compressor.html . Structure only; no competitor copy, imagery, ratings, performance or compatibility claims imported. The reference's illustration areas are adapted to factual specification cards, not fake product screenshots. Hero, existing notes, header/footer and file-processing behavior are unchanged. Billing and payment are not enabled.

## Next-tool handoff proposal (not implemented here)

The useful unit is a finished file, not a new conversion page. Add a small **Continue with this file** result area that offers at most three compatible existing tools.

1. For a video result, offer compression, trimming and audio extraction (excluding the current tool). Do not send an MP3 result to a video-only tool.
2. For an image result, offer resizing, compression or conversion. Background removal must remain an explicit, authenticated, credit-consuming action, never an automatic next step.
3. Start with video conversion → compression. Frame extraction can join later after that tool exists; do not display a dead button now.

### Small implementation boundary

- One shared `MediaHandoff` adapter and one result-actions component; reuse each tool's existing file validation and job state.
- Current tools revoke object URLs on unmount. Do not pass an object URL across a full-page navigation; do not put base64 media in localStorage, cookies, URLs or Analytics.
- When the user chooses a next tool, write one temporary Blob plus filename/MIME/source/expiry to IndexedDB. Carry only an opaque handle scoped to this tab (sessionStorage), and navigate to an allowlisted route.
- The destination validates type and size, loads the file into its normal selected-file state, then removes the temporary record. The user reviews settings and explicitly starts processing. No auto-submit, extra credits or server media upload.
- Apply a short expiry (initial proposal: 30 minutes), bounded temporary storage, explicit removal and expired-record cleanup. Handle denied storage/quota exhaustion with a clear fallback: keep the original Download action and let the user select the saved file manually.
- Do not overwrite a file already selected in the destination without asking. Avoid race/double-click handoff creation; expiry/consumption should be transactional. Do not expose filenames or handoff identifiers to analytics.

### Acceptance for a future implementation

- A real converted video enters compression without re-selection; output downloads and plays.
- Incompatible output never offers an invalid destination.
- Cancel, repeated clicks, expiry, tab closure, disabled storage and quota errors do not lose the existing downloadable result.
- No media network upload during local-to-local handoff, and no provider-credit consumption.
- Verify desktop and mobile memory behavior with real files before loosening limits.

This is a scoped workflow recommendation, not a claim that file handoff is already live. VidShift describes local cross-tool handoff at https://vidshift.io/ .
