# Shared Web and desktop account identity

Ordinary verified Google sessions and desktop authorization must resolve to the
same shared account before any wallet is read or created. `getSession()` calls
`AccountAuth.link()` for verified Google profiles; email sessions already carry
the canonical account ID. Both `user.id` and `session.userId` use that ID.

Migration 006 updates only `streamnest_auth.link_identity`:

1. Keep an existing verified email mapping.
2. Otherwise select the single account with live paid order history or an active
   live Pro batch, including an internal complimentary batch.
3. If multiple accounts have such history/entitlements, require account review.
4. Without entitled candidates, reuse the current/oldest existing account, or
   create the first account as before.

Selection is serialized by verified email. No historical account is merged or
deleted, and no wallet balance, paid order or grant is moved or duplicated.
Internal complimentary access remains separate from actual payment history.

Apply only `db/migrations/006_shared_entitlement_identity.sql` transactionally
against the existing production shared database before deploying this change.
Do not rerun the historical billing migrations as a repair. A page refresh is
sufficient for existing verified Google sessions to resolve through this path.
Identity resolution errors must not fall back to provisioning a Free wallet.

Regression coverage includes the actual account-linking SQL against PGlite,
the normal Web session wrapper with no prior mapping, repeated Google subjects,
and rejection of ambiguous entitled accounts. The header uses an accessible
avatar disclosure menu instead of a central Account navigation link or a
one-click avatar sign-out action.
