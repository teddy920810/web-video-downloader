import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import process from 'node:process';
import { URL } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { billingMigrationPlan } from './billing-migration-plan.mjs';

async function main() {
  const release = process.argv.includes('--production-release');
  if (release && (process.env.VERCEL_ENV !== 'production' || process.env.BILLING_MODE !== 'live')) {
    process.stdout.write('Production billing migration skipped outside an enabled live release.\n');
    return;
  }
  // Vercel builds use only their actual runtime environment, never local copies.
  const env = release ? { ...process.env } : { ...parseEnv(await readFile('.env.local', 'utf8')),
    ...parseEnv(await readFile('.secrets/creem-live.env', 'utf8')), ...process.env };
  if (env.BILLING_MODE !== 'live' || !env.DATABASE_URL || !env.CREEM_API_KEY?.startsWith('creem_') || env.CREEM_API_KEY.startsWith('creem_test_'))
    throw new Error('Live configuration required.');
  const identity = value => { const url = new URL(value); return `${url.hostname.replace(/-pooler(?=\.)/, '')}${url.pathname}`; };
  if (env.BILLING_TEST_DATABASE_URL && identity(env.DATABASE_URL) === identity(env.BILLING_TEST_DATABASE_URL))
    throw new Error('Refusing a shared sandbox database.');
  const sql = neon(env.DATABASE_URL);
  const [baseline] = await sql`SELECT
    (SELECT COUNT(*)::int FROM tool_accounts) AS accounts,
    (SELECT COUNT(*)::int FROM credit_reservations WHERE status='reserved') AS held_jobs,
    (SELECT COALESCE(SUM(free_credits),0)::int FROM credit_wallets) AS free_credits,
    (SELECT COALESCE(SUM(paid_credits),0)::int FROM credit_wallets) AS paid_credits,
    to_regclass('public.billing_orders') IS NOT NULL AS billing_installed`;
  process.stdout.write(JSON.stringify({ phase: 'baseline', ...baseline }) + '\n');
  if (baseline.billing_installed) {
    process.stdout.write('Billing schema already exists; inspect it before any further migration.\n');
    return;
  }
  if (!release && !process.argv.includes('--apply')) {
    process.stdout.write('Ready: apply only migration 004 in a locked transaction with wallet and held-credit assertions. Add --apply to execute.\n');
    return;
  }
  const backup = await sql.transaction([
    sql`SELECT user_id,free_credits,paid_credits,updated_at FROM credit_wallets`,
    sql`SELECT * FROM credit_reservations WHERE status='reserved'`,
    sql`SELECT pg_get_functiondef(oid) AS definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('reserve_tool_credits','consume_tool_credits','refund_tool_credits')`,
  ], { readOnly: true, isolationLevel: 'RepeatableRead' });
  await mkdir('.secrets', { recursive: true });
  await writeFile(`.secrets/billing-before-live-${Date.now()}.json`, JSON.stringify({ at: new Date().toISOString(), baseline, backup }), { flag: 'wx' });
  const source = await readFile('db/migrations/004_billing_credit_batches.sql', 'utf8');
  await sql.transaction(billingMigrationPlan(source).map(statement => sql.query(statement)));
  const [result] = await sql`SELECT (SELECT COUNT(*)::int FROM credit_batches WHERE mode='legacy') AS legacy_batches,
    (SELECT COUNT(*)::int FROM billing_orders) AS orders,
    (SELECT COALESCE(SUM(free_credits),0)::int FROM credit_wallets) AS free_credits,
    (SELECT COALESCE(SUM(paid_credits),0)::int FROM credit_wallets) AS paid_credits`;
  process.stdout.write(JSON.stringify({ phase: 'applied', ...result }) + '\n');
}
main().catch(() => { process.stderr.write('Live billing migration failed; no credentials or account details are logged. Inspect configuration and database availability before retrying.\n'); process.exitCode = 1; });
