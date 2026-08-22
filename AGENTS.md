# Project instructions

- Generate SEO and content pages statically with Astro.
- Use React islands only for interactive features.
- Never expose R2 or provider credentials to browser code.
- Store uploaded images, results, and MVP job state in the private R2 bucket.
- Keep watermark processing behind the `WatermarkProvider` interface.
- Do not commit `S3-info.txt`, `.env`, or `.env.*` files.
- Write or update tests before implementing behavior changes.
- Before handing off changes, run `npm run verify`; it includes coverage, lint, build, and browser E2E.
- Run `npm run test:smoke:production` after production environment, domain, R2, CORS, or deployment changes. It writes temporary objects to the real bucket, so do not run it speculatively or in a loop.

## Project startup and delivery

- The canonical repository is `teddy920810/web-video-downloader`; reject similarly named checkouts whose `origin` does not match.
- Before editing, report the normalized path, `origin`, branch, HEAD, and working-tree status. Preserve unrelated user changes.
- Read this file, `README.md`, and `docs/DEVELOPER_GUIDE.md` completely before implementing.
- Classify the request as read-only diagnosis, local iteration, or delivery to `main`. If an implementation target is unclear, verify locally but do not commit, push, merge, or deploy.
- Separate purchases, OAuth/cloud permissions, and actions consuming the one-use trial from work Codex can complete automatically.
- Keep implementation and repository scripts cross-platform; prefer Node/npm scripts over shell-specific logic.

## Release status gates

- Report web verification, repository/PR state, Vercel deployment, backend deployment, OAuth flow, and the final trial download as separate gates.
- Never consume a user's one-use trial without explicit authorization.
- Do not label the flow complete until the applicable real-user path is verified.
- If similar failures affect multiple services, check provider status and local process conflicts before changing code or repeatedly deploying.

## Third-party integration contract rules

- Treat vendor-provided installation snippets as integration contracts, not ordinary code to refactor.
- Preserve an official or user-provided snippet verbatim, including function shape, argument objects, command order, script attributes, IDs, and initialization timing. Replace only documented placeholders.
- Do not modernize, reformat semantically, optimize, or substitute "equivalent" syntax in analytics, authentication, payment, cloud SDK, consent, or other third-party bootstrap code unless the vendor documentation explicitly supports the change.
- If a deviation is necessary, explain the exact difference and risk to the user and obtain approval before editing it.
- Before changing an integration, verify the current primary vendor documentation. Record the relevant documentation link in the PR, commit context, test, or nearby comment when the constraint is non-obvious.
- Add a focused regression test before changing critical bootstrap code. The test must lock the vendor-required behavior, not merely check that a script URL or ID is present.
- Verify the real end-to-end signal after deployment: for analytics, confirm the expected network event or provider Realtime/DebugView result; for other integrations, use the provider's equivalent diagnostic. Script presence and HTTP 200 alone are insufficient.
- Do not declare a production integration complete when end-to-end verification is unavailable. Clearly report the unverified step and ask the user to perform or authorize the provider-side check.
