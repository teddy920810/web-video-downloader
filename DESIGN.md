# Streamnest · Clarity

Selected visual direction: the first image displayed in the 2026-09-06 design
review. This is the common presentation layer, independent of utilities/downloader
mode. Preserve existing CMS copy, brand logo, media assets and product behavior.

## Tokens and typography

- White page `#ffffff`, quiet surface `#fafafa`, hover `#f3f4f4`.
- Ink `#0a0a0a`, body `#1c1c1e`, secondary `#5a5a5c`, separator `#e5e5e5`.
- Mint selected surface `#e8f7f1`, accessible accent `#007a5e`, dark accent `#005c47`.
- Black pill primary action; white secondary action; 44px minimum touch controls.
- Self-hosted Inter Variable, system fallbacks; code inputs retain monospace.
- Body 14–16px, section headings 20–24px, account title 30–42px, marketing
  title responsive 36–64px. Four-pixel spacing scale, 12px cards, 8px inputs.
- Prefer whitespace and dividers over nested cards. Shadows only for elevation.

## Components and states

- Header identity slot has stable width for loading, signed-out and signed-in
  states. Collapse navigation before labels collide; never hide the entire
  sign-out label on mobile.
- Account summary is one flat row, with separators rather than independent
  cards. Desktop sidebar 224–248px; mobile uses an expandable account menu.
- Current item: mint background plus green edge; hover: gray; keyboard focus:
  separate two-pixel outline. Never style hover as a second current page.
- Tool entry remains split; selecting a file expands the workspace. Media
  previews retain functional dark/transparent backgrounds. Overlays, inputs,
  notices and actions use the common palette in every processing state.
- Optional downloader marketing artwork remains intact. Its dark artwork is
  not a source of shared application tokens. No product visibility rules change.
- Respect reduced motion; do not animate geometry on hover.

## Protected contracts

Do not copy AI-generated mock text into production. Keep actual credit rules,
ledger descriptions, administrator permissions, Coming Soon and support limits.
No changes to OAuth, analytics/consent bootstrap, billing, backend, assets or
CMS values are required by this visual system.

## Local delivery checklist

- [x] Canonical checkout verified; selected reference resolved.
- [x] Red regression tests reproduced legacy palette/mobile menu failures.
- [x] Shared tokens, typography, navigation, footer and surface styling.
- [x] Account summary, current/hover distinction, mobile navigation.
- [x] Targeted tests green.
- [x] Full repository verification.
- [x] Same-state screenshot comparison and responsive design QA.
- [x] Local product processing and download checks (browser fixtures, no paid AI).
- [x] Final protected-content diff audit.

Local implementation was reviewed before the separately authorized PR/main and
Vercel release. Release gates require CI and production presentation checks;
no one-time download trial or paid AI job is consumed by visual verification.
