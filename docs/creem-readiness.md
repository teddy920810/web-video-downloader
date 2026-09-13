# Creem registration readiness — 2026-09-13

Status: local website changes ready for review; production publication and real product acceptance are pending. Do not label the merchant approved or the whole site registration-ready from this document.

## Confirmed business facts

- Operator: Shi Yao, individual developer in mainland China.
- Support: support@streamnest.io; owner confirmed sending and receiving mail.
- Free: all existing browser-local media tools. Background Remover is the only current credit-based tool, at one credit per successful image. No PDF scope.
- Pro: USD 4.99 per paid billing month, 500 credits, expire at period end without rollover.
- Packs: 300 / 1,000 / 2,000 / 10,000 credits for USD 4.50 / 15 / 30 / 150, each valid 24 calendar months from purchase. Larger purchases contact support.
- Refunds: owner approved a 7-calendar-day window for each payment, including renewal, if that payment's credits have not been consumed; statutory rights and service/billing exceptions remain. Three-business-day support response.

## Implemented locally

The pricing page uses the accepted white/black/green three-card design and the existing shared header, font, logo and footer. Astro renders the page and a React island handles pack selection. Inputs remain disabled until hydration so early clicks cannot leave an incorrect total. Checkout remains disabled and visible launch notices explain that purchases are not open. Pricing metadata describes launch prices without publishing an available paid Offer.

The public footer and account support use the same CMS-configured mailbox. Terms, privacy and refund pages identify the operator and include the confirmed rules. Subscription account copy and FAQs match pricing. The old advertised Pro local-file allowance is removed; existing local processing behavior is unchanged.

This does not implement paid credit batches, expiry, recurring grants, refunds, subscription cancellation or Creem webhooks. These need verified provider events and local ledger work before actual sales. No fake checkout or account status was added.

## Verification

- Added browser test first; it failed on the old pricing page before implementation.
- Four pack totals, disabled checkout, FAQ, public support/policies, narrow 320px layout and pricing accessibility pass.
- `npm run verify`: 319 unit tests pass, static checks and build pass, 60 browser tests pass with 1 optional external-video test skipped, utilities suite 15 pass.
- Independent browser inspection at 1440px and 390px: readable cards, selected 10,000 pack, no horizontal overflow, no console errors in a fresh browser. Auth is mocked anonymous for this visual check; no real Google identity or processing acceptance is implied.
- After the final retention wording correction, both legal-content tests and `npm run build` passed again; no processing code changed.

## Storage configuration finding and approved repair

Read-only inspection of the real R2 bucket referenced by local configuration found no background-removal expiry rule. Its two exact prefixes held 29 objects, including 23 older than 24 hours. After the owner explicitly authorized expiry of existing objects, two 1-day lifecycle rules were added for `tool-inputs/background-remover/` and `tool-results/background-remover/`; the original two rules were preserved and the resulting four rules were read back successfully.

The Vercel project binding was checked, but production R2 variables are marked SENSITIVE and cannot be compared with local values. This association and actual asynchronous deletion remain unverified. No object content was retrieved or directly deleted. The website wording now distinguishes configured expiry from physical deletion.

Cloudflare documents asynchronous lifecycle cleanup: https://developers.cloudflare.com/r2/buckets/object-lifecycles/

## Remaining before advising registration

1. Publish the reviewed website changes to the formal domain and recheck public pricing, contact, legal pages, navigation, metadata and routes.
2. Verify one real background-removal input, delivered output and credit settlement; any paid provider call needs a separately stated budget. Verify the actual production storage target and expiry metadata during that flow.
3. Check actual lifecycle cleanup evidence, product/content rights and the full public route inventory against prohibited-use requirements. Current utilities-mode tests prove local downloader/API/blog exclusion, not every production cache or historical route.
4. Complete the commercial-use assessment for the pinned provider/model and cost estimate. The upstream package links to MIT licensing and the Replicate listing estimates about USD 0.00042 per run, but neither alone is a complete pinned-weight rights or total operating-cost audit.

Creem review requirements: https://docs.creem.io/merchant-of-record/account-reviews/account-reviews

After registration, complete identity/payout setup, test payment integration and subscription controls, then satisfy any additional review evidence and obtain applicable approval before enabling live payments.
