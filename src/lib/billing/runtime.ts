import { getSecret } from 'astro:env/server';
import { neon } from '@neondatabase/serverless';
import { billingConfig } from './contracts';
import { BillingService, CreemClient, type QueryDatabase } from './service';

export function accountDatabaseUrl() {
  if (['test', 'live'].includes(getSecret('BILLING_MODE') ?? ''))
    return billingConfig(getSecret)!.databaseUrl;
  const url = getSecret('DATABASE_URL');
  if (!url) throw new Error('Account database unavailable.');
  return url;
}
export function getBilling() {
  const config = billingConfig(getSecret);
  if (!config) return null;
  const sql = neon(config.databaseUrl);
  const db: QueryDatabase = {
    query: async <T extends Record<string, unknown>>(
      query: string,
      values?: unknown[],
    ) => (await sql.query(query, values)) as T[],
  };
  return {
    config,
    service: new BillingService(db, new CreemClient(config), config),
  };
}
