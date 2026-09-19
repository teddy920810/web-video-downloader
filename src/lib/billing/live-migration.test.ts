import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
import { billingMigrationPlan } from '../../../scripts/billing-migration-plan.mjs';

it('upgrades a populated wallet without losing existing balances or held job credits', async () => {
  const db = new PGlite();
  try {
    const { readdir } = await import('node:fs/promises');
    for (const name of (await readdir('db/migrations')).filter(n => /^00[1-3]_/.test(n)).sort())
      await db.exec(await readFile(`db/migrations/${name}`, 'utf8'));
    await db.exec("INSERT INTO tool_accounts(user_id,email) VALUES('legacy','legacy@example.test'); INSERT INTO credit_wallets(user_id,free_credits,paid_credits) VALUES('legacy',1,10)");
    const held = (await db.query<{ id: string }>("SELECT * FROM reserve_tool_credits('legacy','background-remover',3,'held-before-migration')")).rows[0];
    const source = await readFile('db/migrations/004_billing_credit_batches.sql', 'utf8');
    const plan = billingMigrationPlan(source);
    await db.transaction(async tx => { for (const statement of plan) await tx.exec(statement); });
    expect((await db.query('SELECT free_credits,paid_credits FROM credit_wallets')).rows[0]).toEqual({ free_credits: 0, paid_credits: 8 });
    await db.query('SELECT refund_tool_credits($1::uuid)', [held.id]);
    expect((await db.query('SELECT free_credits,paid_credits FROM credit_wallets')).rows[0]).toEqual({ free_credits: 1, paid_credits: 10 });
    await db.transaction(async tx => { for (const statement of plan) await tx.exec(statement); });
    expect((await db.query('SELECT * FROM credit_batches')).rows).toHaveLength(1);
  } finally { await db.close(); }
}, 30000);
