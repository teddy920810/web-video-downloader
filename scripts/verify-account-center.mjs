import { readFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import process from 'node:process';
import assert from 'node:assert/strict';
import { neon } from '@neondatabase/serverless';

for (const name of ['.env.local', '.env']) {
  try {
    for (const line of (await readFile(resolve(name), 'utf8')).split(/\r?\n/)) {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch (error) { if (error?.code !== 'ENOENT') throw error; }
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const sql = neon(process.env.DATABASE_URL);
const owner = `account-smoke-${randomUUID()}`;
const users = [owner, `${owner}-2`, `${owner}-3`];
const codes = [];
async function code(maxUses = 1, expires = new Date(Date.now() + 86400000).toISOString(), disabled = false) {
  const id = randomUUID(); codes.push(id);
  const hash = createHash('sha256').update(randomUUID()).digest('hex');
  await sql`INSERT INTO reward_codes(id, code_hash, label, credits, max_uses, expires_at, disabled, created_by)
    VALUES(${id}::uuid, ${hash}, 'isolated database smoke', 2, ${maxUses}, ${expires}::timestamptz, ${disabled}, ${owner})`;
  return hash;
}
async function redeem(user, hash) { return (await sql`SELECT * FROM redeem_reward_code(${user}, ${hash})`)[0].outcome; }
try {
  for (const user of users) {
    await sql`INSERT INTO tool_accounts(user_id, email) VALUES(${user}, 'account-smoke@invalid.example')`;
    await sql`INSERT INTO credit_wallets(user_id, free_credits) VALUES(${user}, 0)`;
  }
  const same = await code();
  const repeated = await Promise.all(Array.from({ length: 5 }, () => redeem(owner, same)));
  assert.equal(repeated.filter((result) => result === 'redeemed').length, 1);
  assert.equal(repeated.filter((result) => result === 'already_redeemed').length, 4);
  const quota = await code();
  const raced = await Promise.all(users.slice(1).map((user) => redeem(user, quota)));
  assert.deepEqual(raced.sort(), ['exhausted', 'redeemed']);
  assert.equal(await redeem(owner, await code(1, '2020-01-01T00:00:00.000Z')), 'expired');
  assert.equal(await redeem(owner, await code(1, undefined, true)), 'disabled');
  assert.equal(await redeem(owner, '0'.repeat(64)), 'invalid');
  await redeem(owner, '0'.repeat(64)); await redeem(owner, '0'.repeat(64));
  assert.equal(await redeem(owner, same), 'rate_limited');
  const ledger = await sql`SELECT COUNT(*)::int AS count, SUM(free_delta)::int AS total FROM credit_ledger WHERE user_id = ${owner}`;
  assert.equal(ledger[0].count, 1); assert.equal(ledger[0].total, 2);
  const wallet = await sql`SELECT free_credits FROM credit_wallets WHERE user_id = ${owner}`;
  assert.equal(wallet[0].free_credits, 2);
  await sql`INSERT INTO account_preferences(user_id, nickname, marketing_opt_in) VALUES(${owner}, 'Saved nickname', FALSE)`;
  // Simulate a later Google profile refresh: preferences must remain independent.
  await sql`UPDATE tool_accounts SET display_name = 'Google name' WHERE user_id = ${owner}`;
  const profile = await sql`SELECT nickname, marketing_opt_in FROM account_preferences WHERE user_id = ${owner}`;
  assert.equal(profile[0].nickname, 'Saved nickname'); assert.equal(profile[0].marketing_opt_in, false);
  process.stdout.write('Account database checks passed: concurrent repeat, total-use cap, expiry, disable, throttling, ledger balance, profile isolation. No provider calls.\n');
} finally {
  // Exact generated IDs only; no user data is selected or removed.
  for (const id of codes) await sql`DELETE FROM reward_codes WHERE id = ${id}::uuid AND created_by = ${owner}`;
  for (const user of users) await sql`DELETE FROM tool_accounts WHERE user_id = ${user}`;
  process.stdout.write('Synthetic account and code records cleaned up.\n');
}
