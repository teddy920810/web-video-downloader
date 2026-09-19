# Creem billing integration

The integration supports isolated sandbox billing and gated live billing. Merchant verification is handled in the separate certification task. Sandbox acceptance supports submitting merchant review; actual monthly renewal and deploying live billing are not documented prerequisites for submitting that review.

## Confirmed offers

| Offer key | USD | Credits | Validity |
|---|---:|---:|---|
| pro-monthly-500 | 4.99 monthly | 500 each paid period | Provider billing-period end, no rollover |
| pack-300 | 4.50 once | 300 | 24 calendar months |
| pack-1000 | 15.00 once | 1,000 | 24 calendar months |
| pack-2000 | 30.00 once | 2,000 | 24 calendar months |
| pack-10000 | 150.00 once | 10,000 | 24 calendar months |

Current background removal costs one credit per successful job. Free/promotional credits are spent first, then available paid batches in earliest-expiry order. Processing failures restore the original allocation only while that batch is valid and has not been revoked.

## Configuration and isolation

The default `BILLING_MODE=disabled` keeps checkout unavailable. `test` is rejected when `VERCEL_ENV=production`; `live` is rejected on Vercel preview deployments. Live uses the existing production `DATABASE_URL`, a live key, a separate live webhook secret, and all five live product IDs. Provider mode `prod` maps to the internal `live` ledger mode. A test key, test payload or test checkout URL is rejected in live mode.

Test billing requires all of:

- `CREEM_API_KEY`: a `creem_test_` key, server only.
- `CREEM_WEBHOOK_SECRET`: the test dashboard webhook signing secret, not the API key.
- `BILLING_TEST_DATABASE_URL`: a separately provisioned, empty Neon/PostgreSQL database; do not point it at the production database. The app rejects the same database identity as `DATABASE_URL` (including pooled aliases) and never falls back when test configuration is incomplete.
- `CREEM_PRODUCT_IDS`: JSON mapping the offer keys above to the already created test product IDs.

When test mode is enabled, both account details and the credit store use the isolated database. Existing Google authentication remains unchanged. Never copy production user data into a preview database.

Apply migrations 001–004 to the empty test database before enabling the preview: `npm run db:migrate:billing-test` checks the target and prints the plan; `npm run db:migrate:billing-test -- --apply` applies all migrations in one transaction. This dedicated command always targets `BILLING_TEST_DATABASE_URL`, rejects production and rejects the default database identity (including pooled vs unpooled URLs). Do not use the generic migration command with the default local environment, which may contain production credentials.

## Routes

| Route | Authentication | Behavior |
|---|---|---|
| GET /api/billing/status | Google session when enabled | Refresh expiry, show only the current user's batches and subscription |
| POST /api/billing/checkout | Google session + same-origin JSON | Accept only catalog offer and retry UUID; persist local order before provider call |
| POST /api/billing/webhook | HMAC-SHA256 over exact raw body | Verify environment, normalize and atomically apply signed events |
| POST /api/billing/cancel | Google session + ownership + same-origin JSON | Explicitly schedule cancellation at period end |
| POST /api/billing/portal | Google session + ownership + same-origin JSON | Create a billing portal link for the owner |

The checkout success URL returns to `/account/credits?checkout=returned`. A redirect never grants credits. The account offers an explicit refresh action while awaiting the webhook.

## Payment and refund behavior

- One-time grants use `checkout.completed`, a paid order, the configured product/price, and the server-created order reference. Order ID is the payment deduplication key.
- Creem's 100% discounted review purchases retain the catalog `amount` and report `amount_paid: 0`. Authenticated paid events still deliver the purchased allowance. Batch accounting uses the actual paid amount when supplied, and zero-total purchases do not offer a monetary refund. Embedded subscription transaction identity, environment, paid status, currency and subscription are validated before using its paid amount.
- Pro grants use `subscription.paid`, its transaction ID, and the provider period dates. `subscription.active` and `checkout.completed` do not add monthly credits. Renewals reuse the original local order reference.
- A unique event receipt and payment key prevent double grants. A unique subscription/period index prevents a second grant for the same period. SQL transaction failure rolls back the receipt for retry.
- Webhook reconciliation is serialized with a PostgreSQL advisory transaction lock to cover concurrent refund/grant races. Credit operations lock the user wallet before reservations and batches.
- Lifecycle updates are ordered by event time. Only a valid paid Pro batch activates Pro; cancellation and past-due events do not invent credits or extend dates.
- Full successful refunds revoke the corresponding batch. Tombstones also block payments delivered after their refunds. Disputes revoke the affected payment's remaining credits. Partial refunds are recorded for manual review; they do not silently revoke a full batch.
- If a successful refund notification has incomplete cumulative amounts, the service retrieves the transaction from Creem and validates its identity, environment, status and amounts before deciding whether it is a full refund. A previously reviewed receipt can be promoted to a confirmed revocation under the same event ID; subsequent deliveries remain duplicates. Provider verification failures remain retryable.
- Refunding the current Pro period creates a durable cancellation outbox. The webhook handler cancels the subscription immediately and only marks the outbox complete after provider confirmation. Failure returns an error so Creem retries; a duplicate event still drains pending cancellations.
- The refund request link follows the agreed seven-day unused-payment policy. It is hidden while a batch has consumed or reserved credits, or has already been revoked. Requests and exceptional refunds remain support-reviewed; no browser can issue a refund. Expired unused credits outside the seven-day window are ineligible for routine refunds.

## Acceptance checklist

| Item | Local verification | Real Creem sandbox |
|---|---|---|
| Five product prices | Existing product configuration verified | Products already created |
| Login and order attribution | API tests; browser fixture | Chrome login and pack purchase passed |
| Checkout retry and owner mapping | Service + actual PostgreSQL engine test | Real checkout attribution and declined-to-success retry passed |
| Pack grant and 24-month expiry | Contract + SQL tests, including leap day | Actual signed callback granted 300 once |
| Pro grant, cancellation and expiry | Contract + SQL + browser tests, including renewal and expiry | First payment and scheduled cancellation passed; actual next-month renewal not observed |
| Idempotency and notification ordering | Event/payment keys and SQL tests | Authentic provider body and original signature replayed concurrently three times: all duplicates, balance unchanged |
| Successful usage / failed usage restoration | Actual SQL functions and credit-service tests | Two successful images: one free then one paid; balance 299 |
| Refund revocation / cancellation retry | SQL + provider-boundary tests | Pro correction and subsequent autonomous pack refund passed |
| Test/production isolation | Runtime tests and disabled default | Separate database and test credentials configured |
| 100% discounted review purchases | Contract and SQL tests: actual-paid accounting, zero-total refund eligibility | Real free pack and Pro purchases granted 300 + 500; cancellation retained the current allowance |

`npm run verify` includes coverage, lint, build, the existing browser suites, and `test:e2e:billing`. Automated database tests execute the actual migrations and PL/pgSQL functions in PGlite. In addition, the separate empty Neon database created for this task passed a live multi-connection check with synthetic data: three concurrent deliveries granted once, ten concurrent reservations and duplicate consume/refund calls produced the expected balance. Neither check is a real Creem payment. Browser billing tests mock remote calls and must not be represented as real provider payments.

## Verified sandbox setup and live-release boundary

1. Completed for this local session: created `streamnest_billing_test_20260913` empty, applied migrations 001–004 transactionally, and validated concurrency using synthetic accounts. The database is separate from the production database; no production users were copied.
2. Local test server runs at `http://localhost:4321`. The user verified actual Chrome Google login, image processing and downloads. The in-app browser's Google redirect was not verified. Later synthetic QA uses the real billing service and hosted checkout; it does not forge a Google session.
3. The user registered the test webhook and signing secret. A temporary webhook-only public tunnel is recorded outside the repository; it requires the local computer to remain running and is not a production endpoint.
4. Real sandbox acceptance covers paid packs, free/paid processing deductions, Pro initial payment, period-end cancellation, a declined test card without a grant, automatic refund revocation, authentic notification replay, and zero-total review purchases. The initial ambiguous Pro refund required a provider-confirmed reconciliation after the fix; a subsequent refund applied automatically. The two initial zero-total QA batches had only their actual-paid metadata reconciled after that display fix; their original grants were not recreated.
5. Calendar expiry and next-period issuance passed actual SQL tests; a real next-month Creem renewal has not occurred. This is a monitored release item, not a reason to defer merchant-review submission.
6. Sandbox acceptance does not prove live acceptance. Before public sales, configure live credentials/products/webhook, apply migration 004, deploy the integration and verify a real payment with its signed callback and account balance. Keep purchases restricted until that verification is complete.

## Merchant review

The official [account review checklist](https://docs.creem.io/merchant-of-record/account-reviews/account-reviews) requires a live, usable product, clear descriptions and pricing, accessible policies and support, and compliance with its product and branding rules. It does not require a real monthly renewal or live payment collection before submission. Reviewers may perform a limited zero-total test purchase. Do not claim that this local test environment is publicly available to reviewers; provide an accessible review path if Creem requests it. Self-service cancellation must be available when subscriptions are sold. Merchant identity and trademark/confusion decisions are not certified by payment tests.

Official contracts checked during implementation:

- https://docs.creem.io/code/webhooks
- https://docs.creem.io/api-reference/endpoint/create-checkout
- https://docs.creem.io/api-reference/endpoint/cancel-subscription
- https://docs.creem.io/api-reference/endpoint/create-customer-billing
- https://docs.creem.io/api-reference/endpoint/get-transaction
- https://docs.creem.io/api-reference/endpoint/refund-payment
- https://docs.creem.io/features/discounts
- https://docs.creem.io/merchant-of-record/account-reviews/account-reviews
- https://pglite.dev/docs/

## Live release procedure

1. Keep `.secrets/creem-live.env` ignored. Set `BILLING_MODE=live`, a live `CREEM_API_KEY`, its `CREEM_WEBHOOK_SECRET`, and `CREEM_PRODUCT_IDS` containing all five live IDs. Never add credentials to client props or public variables.
2. `BILLING_CHECKOUT_ACCESS=closed` blocks new checkout while preserving signed webhook processing and account management. `validation` allows only authenticated `BILLING_VALIDATION_EMAILS` (comma-separated, server only). `open` permits all signed-in users. Live defaults closed. The price page uses private/no-store caching and applies the same access rule as the checkout service.
3. `npm run db:migrate:billing-live` reads `.env.local` plus `.secrets/creem-live.env`, checks separation and prints aggregate counts without mutation. Add `-- --apply` to back up wallet/held-job rows and old credit functions privately, then apply only 004 in one transaction. Table locks and assertions preserve every wallet and reserved allocation. Existing billing installations are reported without reapplying. Never rerun baseline migrations on production.
4. Configure the live webhook at `https://www.streamnest.io/api/billing/webhook` for checkout, subscription lifecycle, refunds and disputes. Register it disabled while preparing the release; enable after the deployed endpoint rejects unsigned requests and can process valid signatures. Creation/retrieval supplies the signing secret.
5. Store all billing variables in the matching Vercel project's Production environment only. Redeploy after changing them. Preview must not use live keys or the production wallet.
   The prebuild hook applies migration 004 only when both `VERCEL_ENV=production` and `BILLING_MODE=live`. It reads the actual deployed environment without local credential files. The locked transaction checks every existing wallet balance and held allocation; it rolls back on failure and blocks the build. Existing billing installations are left unchanged. A successful migration remains backwards compatible with the previous application if the later build fails. Production build logs report aggregate before/after counts without identities or credentials.
6. Have the owner sign in normally and make the real payment manually. Verify checkout ownership, actual Creem payment, successful callback, exactly-once credit grant, expiration and account display before setting checkout access to open. Do not claim live acceptance based on mocked browser or synthetic SQL tests.

Official live provisioning references: https://docs.creem.io/api-reference/endpoint/create-product and https://docs.creem.io/api-reference/endpoint/create-webhook.
