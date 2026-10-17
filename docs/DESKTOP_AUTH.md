# Desktop identity integration

The public desktop API is deployed independently at `https://desktop.streamnest.io`.
The existing Google provider, checkout catalog, credit ledger and download backend
are preserved. New Web routes are `/sign-in`, `/desktop/authorize`,
`/api/account-auth/send-code`, `/api/account-auth/verify-code`, and
`/api/desktop/approve`. The email login cookie is host-only, HttpOnly, Secure and
SameSite=Lax in production. Codes expire in ten minutes, allow five attempts and
are consumed atomically. Neither codes nor session tokens are returned in JSON.

`SHARED_AUTH_ENABLED=true` enables persistent verified-email identity mapping and
the new routes. Google users retain existing subjects until a verified identity
is linked. Linking chooses an existing paid-history account where unambiguous;
multiple paid identities require review. It never merges historical rows or moves
balances. Email login and desktop authorization resolve the same linked ID.

Required server configuration: `DESKTOP_SERVICE_ORIGIN`,
`DESKTOP_BRIDGE_SECRET`, `EMAIL_PROVIDER=cloudflare`, `EMAIL_FROM`,
`CLOUDFLARE_EMAIL_ACCOUNT_ID`, `CLOUDFLARE_EMAIL_API_TOKEN`, and the existing
database/auth configuration. Values belong in encrypted production environment
variables. No browser receives the bridge secret or email provider token.

Apply additive migration `005_shared_identity.sql` using the existing migration
runner. Rollback: set `SHARED_AUTH_ENABLED=false` and redeploy the previous build.
Leave the additive schema in place; do not delete accounts or roll back billing.
Existing Google flow remains available. Disabling the flag also disables new
email sessions and desktop approval, so communicate that limitation to testers.

Desktop consent requires a verified browser session, same-origin POST and a
server-to-server HMAC assertion expiring in 60 seconds. The desktop API validates
the assertion and sends a one-use code to a loopback callback. PKCE exchange and
device entitlement checks belong to that independent service.

Support mail uses the existing Gmail alias and Resend SMTP. Authentication mail
uses Cloudflare Email Sending. Changing either configuration does not require
replacing the other.
