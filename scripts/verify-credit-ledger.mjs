import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import process from 'node:process';
import { neon } from '@neondatabase/serverless';

for (const name of ['.env.local', '.env']) {
  try {
    for (const line of (await readFile(resolve(name), 'utf8')).split(/\r?\n/)) {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const sql = neon(process.env.DATABASE_URL);
const userId = `credit-smoke-${randomUUID()}`;
try {
  await sql`INSERT INTO tool_accounts(user_id, email) VALUES (${userId}, ${`${userId}@invalid.example`})`;
  await sql`INSERT INTO credit_wallets(user_id) VALUES (${userId})`;
  const first = await sql`SELECT * FROM reserve_tool_credits(${userId}, 'background-remover', 1, ${`${userId}-first`})`;
  const repeated = await sql`SELECT * FROM reserve_tool_credits(${userId}, 'background-remover', 1, ${`${userId}-first`})`;
  if (!first[0] || repeated[0]?.id !== first[0].id) throw new Error('Idempotent reservation verification failed.');
  await sql`SELECT refund_tool_credits(${first[0].id}::uuid)`;
  await sql`SELECT refund_tool_credits(${first[0].id}::uuid)`;
  const refunded = await sql`SELECT free_credits AS "freeCredits" FROM credit_wallets WHERE user_id = ${userId}`;
  if (Number(refunded[0]?.freeCredits) !== 1) throw new Error('Idempotent refund verification failed.');
  const second = await sql`SELECT * FROM reserve_tool_credits(${userId}, 'background-remover', 1, ${`${userId}-second`})`;
  await sql`SELECT consume_tool_credits(${second[0].id}::uuid)`;
  await sql`SELECT consume_tool_credits(${second[0].id}::uuid)`;
  const consumed = await sql`SELECT free_credits AS "freeCredits" FROM credit_wallets WHERE user_id = ${userId}`;
  if (Number(consumed[0]?.freeCredits) !== 0) throw new Error('Idempotent consumption verification failed.');
  const grantKey = randomUUID();
  await sql`SELECT * FROM grant_test_credits(${userId}, 1, ${grantKey}::uuid)`;
  await sql`SELECT * FROM grant_test_credits(${userId}, 1, ${grantKey}::uuid)`;
  const granted = await sql`SELECT free_credits AS "freeCredits" FROM credit_wallets WHERE user_id = ${userId}`;
  const grantEvents = await sql`SELECT COUNT(*)::int AS count FROM credit_ledger WHERE user_id = ${userId} AND event_type = 'grant'`;
  if (Number(granted[0]?.freeCredits) !== 1 || Number(grantEvents[0]?.count) !== 1) {
    throw new Error('Idempotent test-credit grant verification failed.');
  }
  process.stdout.write('Credit reservation, refund, consumption, and grant verification passed.\n');
} finally {
  await sql`DELETE FROM tool_accounts WHERE user_id = ${userId}`;
}
