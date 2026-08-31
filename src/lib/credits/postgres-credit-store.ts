import { getSecret } from 'astro:env/server';
import { neon } from '@neondatabase/serverless';
import type { CreditReservation, CreditStore, ToolAccount, UsageRecord } from './credit-service';
import type { ToolId } from '../product/catalog';

type AccountRow = {
  userId: string;
  email: string;
  name: string | null;
  image: string | null;
  planId: ToolAccount['planId'];
  status: ToolAccount['status'];
  freeCredits: number;
  paidCredits: number;
};

function database() {
  const databaseUrl = getSecret('DATABASE_URL');
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured.');
  return neon(databaseUrl);
}

function accountFrom(row: AccountRow): ToolAccount {
  return { ...row, freeCredits: Number(row.freeCredits), paidCredits: Number(row.paidCredits) };
}

const accountSelection = `
  SELECT a.user_id AS "userId", a.email, a.display_name AS name, a.avatar_url AS image,
    a.plan_id AS "planId", a.status, w.free_credits AS "freeCredits", w.paid_credits AS "paidCredits"
  FROM tool_accounts a JOIN credit_wallets w ON w.user_id = a.user_id
`;

export class PostgresCreditStore implements CreditStore {
  async ensureAccount(profile: { id: string; email: string; name?: string | null; image?: string | null }): Promise<ToolAccount> {
    const sql = database();
    await sql.transaction([
      sql`INSERT INTO tool_accounts(user_id, email, display_name, avatar_url)
        VALUES (${profile.id}, ${profile.email}, ${profile.name ?? null}, ${profile.image ?? null})
        ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name,
          avatar_url = EXCLUDED.avatar_url, updated_at = NOW()`,
      sql`INSERT INTO credit_wallets(user_id) VALUES (${profile.id}) ON CONFLICT (user_id) DO NOTHING`,
    ]);
    const rows = await sql.query(accountSelection + ' WHERE a.user_id = $1 LIMIT 1', [profile.id]);
    if (!rows[0]) throw new Error('Unable to create the account wallet.');
    return accountFrom(rows[0] as AccountRow);
  }

  async getAccount(userId: string): Promise<ToolAccount | null> {
    const rows = await database().query(accountSelection + ' WHERE a.user_id = $1 LIMIT 1', [userId]);
    return rows[0] ? accountFrom(rows[0] as AccountRow) : null;
  }

  async reserve(userId: string, toolId: ToolId, amount: number, idempotencyKey: string): Promise<CreditReservation | null> {
    const rows = await database()`SELECT id, status, amount, free_credits AS "freeCredits", paid_credits AS "paidCredits"
      FROM reserve_tool_credits(${userId}, ${toolId}, ${amount}, ${idempotencyKey})`;
    const row = rows[0] as CreditReservation | undefined;
    return row ? { ...row, amount: Number(row.amount), freeCredits: Number(row.freeCredits), paidCredits: Number(row.paidCredits) } : null;
  }

  async consume(reservationId: string): Promise<void> {
    await database()`SELECT consume_tool_credits(${reservationId}::uuid)`;
  }

  async refund(reservationId: string): Promise<void> {
    await database()`SELECT refund_tool_credits(${reservationId}::uuid)`;
  }

  async recordUsage(record: UsageRecord): Promise<void> {
    await database()`INSERT INTO tool_usage(user_id, tool_id, reservation_id, status, credits, size_bytes, duration_ms, error_code)
      VALUES (${record.userId}, ${record.toolId}, ${record.reservationId}::uuid, ${record.status}, ${record.credits},
        ${record.sizeBytes ?? null}, ${record.durationMs}, ${record.errorCode ?? null})`;
  }

  async listUsage(userId: string, limit: number): Promise<UsageRecord[]> {
    const rows = await database()`SELECT user_id AS "userId", tool_id AS "toolId", reservation_id AS "reservationId",
      status, credits, size_bytes AS "sizeBytes", duration_ms AS "durationMs", error_code AS "errorCode"
      FROM tool_usage WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT ${limit}`;
    return rows.map((row) => ({
      ...(row as unknown as UsageRecord),
      credits: Number(row.credits),
      durationMs: Number(row.durationMs),
      sizeBytes: row.sizeBytes === null ? undefined : Number(row.sizeBytes),
      errorCode: row.errorCode === null ? undefined : String(row.errorCode),
    }));
  }
}
