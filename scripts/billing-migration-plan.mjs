import { splitSqlStatements } from './sql-statements.mjs';

export function billingMigrationPlan(source) {
  return [
    "SET LOCAL lock_timeout='5s'",
    "SET LOCAL statement_timeout='60s'",
    'SELECT pg_advisory_xact_lock(81412341)',
    'LOCK TABLE tool_accounts, credit_wallets, credit_reservations, credit_ledger IN SHARE ROW EXCLUSIVE MODE',
    'CREATE TEMP TABLE billing_wallet_before ON COMMIT DROP AS SELECT user_id,free_credits,paid_credits FROM credit_wallets',
    ...splitSqlStatements(source),
    `DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM billing_wallet_before b FULL JOIN credit_wallets w USING(user_id)
        WHERE b.user_id IS NULL OR w.user_id IS NULL OR b.free_credits<>w.free_credits OR b.paid_credits<>w.paid_credits)
      THEN RAISE EXCEPTION 'migration changed a wallet balance'; END IF;
      IF EXISTS(SELECT 1 FROM credit_wallets w WHERE w.paid_credits<>
        (SELECT COALESCE(SUM(remaining),0) FROM credit_batches b WHERE b.user_id=w.user_id AND b.revoked_at IS NULL AND b.starts_at<=NOW() AND (b.expires_at IS NULL OR b.expires_at>NOW())))
      THEN RAISE EXCEPTION 'migration batch balance mismatch'; END IF;
      IF EXISTS(SELECT 1 FROM credit_reservations r WHERE r.status='reserved' AND r.paid_credits<>
        (SELECT COALESCE(SUM(amount),0) FROM credit_allocations a WHERE a.reservation_id=r.id))
      THEN RAISE EXCEPTION 'migration reservation allocation mismatch'; END IF;
    END; $$`,
  ];
}
