# Account center delivery

- [x] Confirm canonical checkout and release scope.
- [x] Profile and persisted, optional marketing preference (default off).
- [x] Credits, ledger and atomic reward-code redemption.
- [x] Administrator code creation, disable and redemption audit.
- [x] Responsive account shell, FAQ, support and privacy settings.
- [x] Targeted tests, database concurrency checks and full verification.
- [x] Cookie choices and expandable preferences: default-off analytics, locked necessary cookies, reopen and revoke consent.
- [x] Repeat full verification after the requested Cookie UI extension: 297 unit tests, static checks/build, 23 browser tests and 8 utilities browser tests passed; 1 optional sample-video test skipped.
- [ ] PR, CI, merge, production and authenticated functional verification.

Billing, checkout, payment methods, invoices and Desktop licenses are deferred.
Google name/avatar/email remain identity data; the account nickname is separate.
Support contact is configured through Pages CMS and hidden when not configured.
Reward codes grant promotional (free-wallet) credits, not cash or a subscription.
Their expiry governs redemption, not already granted credits. No fabricated renewal date is shown.
Codes are generated server-side and shown once, stored only as a SHA-256 hash.
Repeated redemption cannot credit an account twice; database locking enforces total uses.
Account API responses are private/no-store and mutations require same-origin JSON requests.
Account changes and codes must never be included in Analytics or application logs.

Verification evidence: 20 focused unit tests pass. The real configured Neon database passed concurrent same-user redemption, cross-user maximum-use race, expired/disabled/invalid codes, attempt throttling, balance/ledger agreement and nickname isolation. Synthetic rows were removed. Existing reserve/consume/refund/test-credit checks also pass.

Pre-release full verification: 297 unit tests; static checks and production build; 21 downloader-mode E2E and 8 utilities-mode E2E pass. One optional real-video E2E is skipped because no sample path was supplied. Dependency audit reports zero vulnerabilities. This is the pre-merge checklist; the release PR records subsequent CI and production acceptance.

Database release: apply additive migration 003 before releasing Web. Existing tool and credit APIs remain compatible.

Cookie extension: regression tests first failed for missing preference controls, then five focused browser tests passed. The official Analytics head bootstrap and consent defaults are unchanged; the UI invokes the existing consent bridge. Opening preferences does not grant consent. Advertising stays denied. Revocation updates consent without reloading and destroying a browser-local media job; the next navigation does not load Analytics. VidShift feature research is separate from this release; no additional media tools are implemented here.
Use `node scripts/verify-account-center.mjs` for isolated database tests; it creates and cleans up only its own synthetic records, without invoking any media provider.
