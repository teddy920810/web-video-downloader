import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BillingService } from './service';
let db: PGlite;
const order = 'd8cafbeb-03dd-44d1-a517-ea7e3ea5910a';
const future = () => new Date(Date.now() + 86400000 * 30).toISOString();
const event = (extra: Record<string, unknown> = {}) => ({
  eventId: crypto.randomUUID(),
  eventType: 'checkout.completed',
  eventAt: new Date().toISOString(),
  mode: 'test',
  action: 'grant',
  referenceId: order,
  productId: 'prod_pack',
  customerId: 'cust_one',
  checkoutId: 'ch_one',
  offer: 'pack-300',
  paymentKey: 'order:ord_one',
  credits: 300,
  priceCents: 450,
  kind: 'pack',
  paidAt: new Date().toISOString(),
  startsAt: new Date().toISOString(),
  expiresAt: future(),
  ...extra,
});
const apply = async (e: Record<string, unknown>) =>
  db.query('SELECT apply_billing_event($1::jsonb)', [JSON.stringify(e)]);
const wallet = async () =>
  (
    await db.query<{ free_credits: number; paid_credits: number }>(
      'SELECT free_credits, paid_credits FROM credit_wallets WHERE user_id=$1',
      ['u1'],
    )
  ).rows[0];
const reserve = async (key = crypto.randomUUID(), amount = 1, user = 'u1') =>
  (
    await db.query<{ id: string; status: string }>(
      'SELECT * FROM reserve_tool_credits($1,$2,$3,$4)',
      [user, 'background-remover', amount, key],
    )
  ).rows[0];
describe('PostgreSQL paid credit lifecycle', () => {
  beforeAll(async () => {
    db = new PGlite();
    for (const file of (await readdir('db/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await db.exec(await readFile(`db/migrations/${file}`, 'utf8'));
  }, 30000);
  afterAll(async () => db?.close());
  beforeEach(async () => {
    await db.exec(
      'TRUNCATE tool_accounts, billing_events, billing_revocations CASCADE',
    );
    await db.exec(
      "INSERT INTO tool_accounts(user_id,email) VALUES ('u1','one@example.test'),('u2','two@example.test'); INSERT INTO credit_wallets(user_id,free_credits) VALUES ('u1',0),('u2',0)",
    );
    await db.query(
      "INSERT INTO billing_orders(id,user_id,mode,offer_key,product_id) VALUES ($1,'u1','test','pack-300','prod_pack')",
      [order],
    );
  });
  it('grants a pack and deduplicates both identical events and different events for the same payment', async () => {
    const e = event();
    await apply(e);
    await apply(e);
    await apply({ ...e, eventId: crypto.randomUUID() });
    expect((await wallet()).paid_credits).toBe(300);
    expect((await db.query('SELECT * FROM credit_batches')).rows).toHaveLength(
      1,
    );
  });
  it('rejects a changed product, missing order, and duplicate payment attributed to another order', async () => {
    await expect(apply(event({ productId: 'prod_other' }))).rejects.toThrow();
    await expect(
      apply(event({ referenceId: crypto.randomUUID() })),
    ).rejects.toThrow();
    expect((await wallet()).paid_credits).toBe(0);
  });
  it('reserves once, consumes once, and cannot refund a successful job', async () => {
    await apply(event());
    const key = crypto.randomUUID();
    const r = await reserve(key);
    expect((await reserve(key)).id).toBe(r.id);
    await db.query('SELECT consume_tool_credits($1)', [r.id]);
    await db.query('SELECT consume_tool_credits($1)', [r.id]);
    await db.query('SELECT refund_tool_credits($1)', [r.id]);
    expect((await wallet()).paid_credits).toBe(299);
    expect(
      (
        await db.query<{ consumed: number }>(
          'SELECT consumed FROM credit_batches',
        )
      ).rows[0].consumed,
    ).toBe(1);
  });
  it('returns a failed job to its original batch without extending expiry', async () => {
    await apply(event());
    const r = await reserve();
    await db.query('SELECT refund_tool_credits($1)', [r.id]);
    await db.query('SELECT refund_tool_credits($1)', [r.id]);
    expect((await wallet()).paid_credits).toBe(300);
  });
  it('does not resurrect expired or refunded credits when a held job fails', async () => {
    await apply(event());
    const r = await reserve();
    await db.exec(
      "UPDATE credit_batches SET starts_at=NOW()-INTERVAL '2 days',expires_at=NOW()-INTERVAL '1 second'",
    );
    await db.query('SELECT refund_tool_credits($1)', [r.id]);
    expect((await wallet()).paid_credits).toBe(0);
    expect(await reserve()).toBeUndefined();
  });
  it('spends promotional credits first and then the earliest-expiring paid batch', async () => {
    await apply(event());
    await db.exec('UPDATE credit_wallets SET free_credits=1');
    await reserve();
    expect((await wallet()).paid_credits).toBe(300);
    await apply(
      event({
        paymentKey: 'order:second',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      }),
    );
    const r = await reserve();
    const allocation = await db.query<{ payment_key: string }>(
      'SELECT b.payment_key FROM credit_allocations a JOIN credit_batches b ON b.id=a.batch_id WHERE reservation_id=$1',
      [r.id],
    );
    expect(allocation.rows[0].payment_key).toBe('order:second');
  });
  it('rejects reservation key reuse across accounts and changed amounts', async () => {
    await apply(event());
    const key = crypto.randomUUID();
    await reserve(key);
    await expect(reserve(key, 1, 'u2')).rejects.toThrow();
    await expect(reserve(key, 2)).rejects.toThrow();
  });
  it('revokes a refunded purchase once and keeps separately purchased batches', async () => {
    await apply(event());
    await apply(event({ paymentKey: 'order:second' }));
    const r = await reserve();
    const refund = event({
      action: 'revoke',
      paymentKeys: ['order:ord_one'],
      status: 'refunded',
    });
    await apply(refund);
    await apply(refund);
    await db.query('SELECT refund_tool_credits($1)', [r.id]);
    expect((await wallet()).paid_credits).toBe(300);
  });
  it('retains refund tombstones so delayed payments cannot regrant credits', async () => {
    await apply(
      event({
        action: 'revoke',
        paymentKeys: ['order:ord_one'],
        status: 'refunded',
      }),
    );
    await apply(event());
    expect((await wallet()).paid_credits).toBe(0);
  });
  it('activates Pro only on payment, preserves scheduled cancellation and expires its period independently of packs', async () => {
    await apply(event());
    const proOrder = crypto.randomUUID();
    await db.query(
      "INSERT INTO billing_orders(id,user_id,mode,offer_key,product_id) VALUES ($1,'u1','test','pro-monthly-500','prod_pro')",
      [proOrder],
    );
    const pro = event({
      referenceId: proOrder,
      offer: 'pro-monthly-500',
      productId: 'prod_pro',
      subscriptionId: 'sub_one',
      checkoutId: undefined,
      action: 'subscription',
      status: 'active',
      kind: 'pro',
      credits: 500,
      priceCents: 499,
      paymentKey: 'transaction:one',
    });
    await apply(pro);
    expect(
      (
        await db.query<{ plan_id: string }>(
          'SELECT plan_id FROM tool_accounts WHERE user_id=$1',
          ['u1'],
        )
      ).rows[0].plan_id,
    ).toBe('free');
    await apply({ ...pro, eventId: crypto.randomUUID(), action: 'grant' });
    expect((await wallet()).paid_credits).toBe(800);
    await apply({
      ...pro,
      eventId: crypto.randomUUID(),
      eventAt: future(),
      status: 'scheduled_cancel',
    });
    await apply({ ...pro, eventId: crypto.randomUUID(), status: 'active' });
    expect(
      (
        await db.query<{ status: string }>(
          'SELECT status FROM billing_subscriptions',
        )
      ).rows[0].status,
    ).toBe('scheduled_cancel');
    await db.exec(
      "UPDATE credit_batches SET starts_at=NOW()-INTERVAL '2 days',expires_at=NOW()-INTERVAL '1 second' WHERE kind='pro'",
    );
    await db.query('SELECT refresh_credit_wallet($1)', ['u1']);
    expect((await wallet()).paid_credits).toBe(300);
    expect(
      (
        await db.query<{ plan_id: string }>(
          'SELECT plan_id FROM tool_accounts WHERE user_id=$1',
          ['u1'],
        )
      ).rows[0].plan_id,
    ).toBe('free');
  });
  it('rolls back the event receipt on failure so delivery can be retried', async () => {
    const e = event({ productId: 'wrong' });
    await expect(apply(e)).rejects.toThrow();
    expect((await db.query('SELECT * FROM billing_events')).rows).toHaveLength(
      0,
    );
    await apply({ ...e, productId: 'prod_pack' });
    expect((await wallet()).paid_credits).toBe(300);
  });
  it('reconciles a reviewed refund under the same event id exactly once', async () => {
    await apply(event());
    const refund = event({eventType:'refund.created',action:'review',paymentKeys:['order:ord_one'],status:'refunded'});
    await apply(refund);
    expect((await wallet()).paid_credits).toBe(300);
    await apply({...refund,action:'revoke'});
    await apply({...refund,action:'revoke'});
    expect((await wallet()).paid_credits).toBe(0);
    expect((await db.query("SELECT * FROM credit_ledger WHERE event_type='revoke'")).rows).toHaveLength(1);
    expect((await db.query('SELECT action FROM billing_events WHERE event_id=$1',[refund.eventId])).rows).toEqual([{action:'revoke'}]);
  });
  it('runs checkout, entitlement, usage and account display through the service and actual SQL', async () => {
    const service = new BillingService(
      {
        query: async <T extends Record<string, unknown>>(
          sql: string,
          args?: unknown[],
        ) => (await db.query<T>(sql, args)).rows,
      },
      {
        request: async () => ({
          id: 'ch_one',
          mode: 'test',
          checkout_url: 'https://creem.io/test/payment/ch_one',
        }),
      },
      {
        mode: 'test',
        apiKey: 'creem_test_example',
        webhookSecret: 'secret',
        databaseUrl: 'local',
        products: { 'pack-300': 'prod_pack' },
      },
    );
    expect(
      await service.checkout(
        { id: 'u1', email: 'one@example.test' },
        'pack-300',
        order,
        'https://example.test',
      ),
    ).toEqual({ url: 'https://creem.io/test/payment/ch_one' });
    expect((await wallet()).paid_credits).toBe(0);
    await service.apply(event() as Parameters<typeof service.apply>[0]);
    const r = await reserve();
    await db.query('SELECT consume_tool_credits($1)', [r.id]);
    const summary = await service.summary('u1');
    expect(summary.batches[0]).toMatchObject({
      remaining: 299,
      consumed: 1,
      refundEligible: false,
    });
    expect((await wallet()).paid_credits).toBe(299);
  });
  it('keeps migration reruns from duplicating a paid balance', async () => {
    await apply(event());
    await db.exec(
      await readFile('db/migrations/004_billing_credit_batches.sql', 'utf8'),
    );
    await db.query('SELECT refresh_credit_wallet($1)', ['u1']);
    expect((await wallet()).paid_credits).toBe(300);
    expect((await db.query('SELECT * FROM credit_batches')).rows).toHaveLength(
      1,
    );
  });
  it('delivers zero-total purchases without offering a monetary refund', async () => {
    await apply(event({ priceCents: 0 }));
    const service = new BillingService({ query: async <T extends Record<string, unknown>>(sql: string, args?: unknown[]) => (await db.query<T>(sql, args)).rows }, { request: async () => ({}) }, { mode: 'test', apiKey: 'creem_test_example', webhookSecret: 'secret', databaseUrl: 'local', products: { 'pack-300': 'prod_pack' } });
    expect((await wallet()).paid_credits).toBe(300);
    expect((await service.summary('u1')).batches[0]).toMatchObject({ remaining: 300, refundEligible: false });
  });
  it('reuses pending Pro checkouts even across different browser retry keys', async () => {
    const first = await db.query<{ id: string }>(
      "SELECT * FROM open_billing_order($1,'u1','test','pro-monthly-500','prod_pro')",
      [crypto.randomUUID()],
    );
    const second = await db.query<{ id: string }>(
      "SELECT * FROM open_billing_order($1,'u1','test','pro-monthly-500','prod_pro')",
      [crypto.randomUUID()],
    );
    expect(second.rows[0].id).toBe(first.rows[0].id);
    await expect(
      db.query(
        "SELECT * FROM open_billing_order($1,'u2','test','pro-monthly-500','prod_pro')",
        [first.rows[0].id],
      ),
    ).rejects.toThrow();
  });
  it('issues a fresh monthly allowance on renewal without rolling over the expired period', async () => {
    const proOrder = crypto.randomUUID();
    await db.query("INSERT INTO billing_orders(id,user_id,mode,offer_key,product_id) VALUES ($1,'u1','test','pro-monthly-500','prod_pro')", [proOrder]);
    const base = event({referenceId:proOrder, offer:'pro-monthly-500', productId:'prod_pro', subscriptionId:'sub_renewal', checkoutId:undefined, kind:'pro', credits:500, priceCents:499, status:'active'});
    await apply({...base, paymentKey:'transaction:old', startsAt:'2020-01-01T00:00:00Z', expiresAt:'2020-02-01T00:00:00Z', eventAt:'2020-01-01T00:00:00Z'});
    const renewal = {...base, eventId:crypto.randomUUID(), paymentKey:'transaction:renewal'};
    await apply(renewal); await apply({...renewal,eventId:crypto.randomUUID()});
    expect((await wallet()).paid_credits).toBe(500);
    expect((await db.query('SELECT * FROM credit_batches')).rows).toHaveLength(2);
    await apply(event({action:'revoke',paymentKeys:['transaction:old'],status:'refunded'}));
    expect((await db.query('SELECT * FROM billing_cancellations')).rows).toHaveLength(0);
    await apply(event({action:'revoke',paymentKeys:['transaction:renewal'],status:'refunded'}));
    expect((await wallet()).paid_credits).toBe(0);
    expect((await db.query('SELECT subscription_id FROM billing_cancellations')).rows).toEqual([{subscription_id:'sub_renewal'}]);
  });
  it('persists one replacement order for concurrent retries of an expired checkout', async () => {
    const first = await db.query<{id:string}>("SELECT * FROM replace_expired_billing_order($1,'u1')",[order]);
    const second = await db.query<{id:string}>("SELECT * FROM replace_expired_billing_order($1,'u1')",[order]);
    expect(second.rows[0].id).toBe(first.rows[0].id);
    await expect(db.query("SELECT * FROM replace_expired_billing_order($1,'u2')",[order])).rejects.toThrow();
  });
});
