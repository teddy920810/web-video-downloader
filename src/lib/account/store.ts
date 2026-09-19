import { randomBytes } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { accountDatabaseUrl } from '../billing/runtime';
import { hashRewardCode } from './contracts';

function database() {
  const url = accountDatabaseUrl();
  if (!url) throw new Error('Account database unavailable.');
  return neon(url);
}

export const accountStore = {
  async details(userId: string) {
    const sql = database();
    const [preferences, ledger, reservations, redemptions] = await sql.transaction([
      sql`SELECT nickname, marketing_opt_in AS "marketingOptIn", marketing_updated_at AS "marketingUpdatedAt" FROM account_preferences WHERE user_id = ${userId}`,
      sql`SELECT id::text, event_type AS "eventType", free_delta AS "freeDelta", paid_delta AS "paidDelta", created_at AS "createdAt" FROM credit_ledger WHERE user_id = ${userId} ORDER BY created_at DESC, id DESC LIMIT 50`,
      sql`SELECT COALESCE(SUM(amount), 0)::int AS total FROM credit_reservations WHERE user_id = ${userId} AND status = 'reserved'`,
      sql`SELECT r.code_id AS id, c.label, r.credits, r.created_at AS "createdAt" FROM reward_redemptions r JOIN reward_codes c ON c.id = r.code_id WHERE r.user_id = ${userId} ORDER BY r.created_at DESC LIMIT 50`,
    ]);
    return { preferences: preferences[0] ?? { nickname: '', marketingOptIn: false, marketingUpdatedAt: null }, ledger, reservedCredits: Number(reservations[0]?.total ?? 0), redemptions };
  },
  async profile(userId: string, input: { nickname: string; marketingOptIn: boolean }) {
    await database()`INSERT INTO account_preferences(user_id, nickname, marketing_opt_in, marketing_updated_at)
      VALUES(${userId}, ${input.nickname}, ${input.marketingOptIn}, NOW())
      ON CONFLICT(user_id) DO UPDATE SET nickname = EXCLUDED.nickname,
        marketing_updated_at = CASE WHEN account_preferences.marketing_opt_in <> EXCLUDED.marketing_opt_in THEN NOW() ELSE account_preferences.marketing_updated_at END,
        marketing_opt_in = EXCLUDED.marketing_opt_in, updated_at = NOW()`;
  },
  async redeem(userId: string, code: string) {
    const rows = await database()`SELECT * FROM redeem_reward_code(${userId}, ${hashRewardCode(code)})`;
    return { outcome: String(rows[0]?.outcome ?? 'unavailable'), awarded: Number(rows[0]?.awarded ?? 0) };
  },
  async codes() {
    const sql = database();
    const [codes, redemptions] = await sql.transaction([
      sql`SELECT id, label, credits, max_uses AS "maxUses", used_count AS "usedCount", expires_at AS "expiresAt", disabled FROM reward_codes ORDER BY created_at DESC LIMIT 100`,
      sql`SELECT r.code_id AS "codeId", c.label, r.credits, r.created_at AS "createdAt", r.user_id AS "userId" FROM reward_redemptions r JOIN reward_codes c ON c.id = r.code_id ORDER BY r.created_at DESC LIMIT 100`,
    ]);
    return { codes, redemptions };
  },
  async createCode(userId: string, input: { label: string; credits: number; maxUses: number; expiresAt: string; requestId: string }) {
    const code = randomBytes(16).toString('hex').toUpperCase();
    const rows = await database()`INSERT INTO reward_codes(id, code_hash, label, credits, max_uses, expires_at, created_by)
      VALUES(${input.requestId}::uuid, ${hashRewardCode(code)}, ${input.label}, ${input.credits}, ${input.maxUses}, ${input.expiresAt}::timestamptz, ${userId})
      ON CONFLICT(id) DO NOTHING RETURNING id`;
    return rows.length ? { id: input.requestId, code } : { id: input.requestId, code: null };
  },
  async disableCode(id: string) {
    const rows = await database()`UPDATE reward_codes SET disabled = TRUE WHERE id = ${id}::uuid RETURNING id`;
    return rows.length > 0;
  },
};
