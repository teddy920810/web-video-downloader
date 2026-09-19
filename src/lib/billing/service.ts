import { z } from 'zod';
import { canStartCheckout, providerMode, type BillingConfig, type BillingEvent } from './contracts';

export interface QueryDatabase {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<T[]>;
}
export interface BillingProvider {
  request(
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<Record<string, unknown>>;
}
type Order = {
  id: string;
  user_id: string;
  checkout_id: string | null;
  checkout_url: string | null;
  status: string;
} & Record<string, unknown>;

export class CreemClient implements BillingProvider {
  constructor(
    private readonly config: BillingConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async request(path: string, body?: unknown, idempotencyKey?: string) {
    const response = await this.fetcher(
      `https://${this.config.mode === 'live' ? 'api' : 'test-api'}.creem.io/v1/${path}`,
      {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'x-api-key': this.config.apiKey,
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      },
    );
    if (!response.ok)
      throw new Error('Payment provider is temporarily unavailable.');
    return z.record(z.string(), z.unknown()).parse(await response.json());
  }
}

function hostedUrl(value: unknown, mode: BillingConfig['mode'], checkout = false) {
  const url = new URL(z.string().parse(value));
  if (
    url.protocol !== 'https:' ||
    ![
      'creem.io',
      'www.creem.io',
      'test-checkout.creem.io',
      'checkout.creem.io',
    ].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new Error('Invalid payment URL.');
  // Current live API returns /checkout/{product}/{checkout}; retain legacy /payment links.
  if ((checkout && (mode === 'test' ? !url.pathname.startsWith('/test/') : !/^\/(checkout|payment)\//.test(url.pathname))) ||
    (mode === 'live' && (url.hostname.startsWith('test-') || url.pathname.startsWith('/test/'))))
    throw new Error('Checkout URL environment mismatch.');
  return url.href;
}

export class BillingService {
  constructor(
    private readonly db: QueryDatabase,
    private readonly provider: BillingProvider,
    private readonly config: BillingConfig,
  ) {}
  async checkout(
    user: { id: string; email: string },
    offer: string,
    requestId: string,
    origin: string,
  ) {
    if (!canStartCheckout(this.config, user.email)) throw new Error('Purchases are not open for this account yet.');
    const productId = this.config.products[offer];
    if (!productId) throw new Error('This offer is not available yet.');
    let [order] = await this.db.query<Order>(
      'SELECT * FROM open_billing_order($1::uuid,$2,$3,$4,$5)',
      [requestId, user.id, this.config.mode, offer, productId],
    );
    if (!order) throw new Error('Unable to create an order.');
    if (order.status === 'paid')
      return {
        url: new URL('/account/credits?checkout=returned', origin).href,
      };
    for (
      let attempt = 0;
      order.checkout_url || order.status === 'expired';
      attempt++
    ) {
      if (attempt >= 5) throw new Error('Please start a new checkout.');
      if (order.status !== 'expired') {
        const existing = await this.provider.request(
          `checkouts?checkout_id=${encodeURIComponent(order.checkout_id!)}`,
        );
        if (
          existing.mode !== providerMode(this.config) ||
          existing.id !== order.checkout_id
        )
          throw new Error('Checkout identity mismatch.');
        if (existing.status === 'completed')
          return {
            url: new URL('/account/credits?checkout=returned', origin).href,
          };
        if (existing.status !== 'expired')
          return { url: hostedUrl(order.checkout_url, this.config.mode, true) };
      }
      [order] = await this.db.query<Order>(
        'SELECT * FROM replace_expired_billing_order($1::uuid,$2)',
        [order.id, user.id],
      );
      if (!order) throw new Error('Unable to renew this checkout.');
    }
    // Official REST contract: https://docs.creem.io/api-reference/endpoint/create-checkout
    const result = await this.provider.request(
      'checkouts',
      {
        product_id: productId,
        request_id: order.id,
        units: 1,
        customer: { email: user.email },
        success_url: new URL('/account/credits?checkout=returned', origin).href,
        metadata: { referenceId: order.id },
      },
      `checkout-${order.id}`,
    );
    const id = z
      .string()
      .regex(/^ch_[A-Za-z0-9]+$/)
      .parse(result.id);
    if (result.mode !== providerMode(this.config))
      throw new Error('Checkout environment mismatch.');
    const url = hostedUrl(result.checkout_url, this.config.mode, true);
    const rows = await this.db.query(
      "UPDATE billing_orders SET checkout_id=$2,checkout_url=$3,status=CASE WHEN status='paid' THEN status ELSE 'created' END WHERE id=$1::uuid AND (checkout_id IS NULL OR checkout_id=$2) RETURNING id",
      [order.id, id, url],
    );
    if (!rows.length) throw new Error('Checkout identity mismatch.');
    return { url };
  }
  async apply(event: BillingEvent) {
    if (event.eventType === 'refund.created' && event.action === 'review') {
      // Refund webhook snapshots can omit the cumulative refunded amount.
      // Confirm the transaction through the official API before revoking credits.
      const transactionKey = event.paymentKeys?.find((key) => key.startsWith('transaction:'));
      const transactionId = z.string().regex(/^tran_[A-Za-z0-9]+$/).parse(transactionKey?.slice('transaction:'.length));
      const transaction = z.object({
        id: z.literal(transactionId),
        mode: z.literal(providerMode(this.config)),
        status: z.string(),
        amount_paid: z.number().int().positive(),
        refunded_amount: z.number().int().nonnegative(),
        order: z.string().regex(/^ord_[A-Za-z0-9]+$/).nullish(),
      }).parse(await this.provider.request(`transactions?transaction_id=${encodeURIComponent(transactionId)}`));
      if (transaction.status === 'refunded' && transaction.refunded_amount >= transaction.amount_paid) {
        event = {
          ...event,
          action: 'revoke',
          paymentKeys: [`transaction:${transactionId}`, ...(transaction.order ? [`order:${transaction.order}`] : [])],
        };
      }
    }
    const result = await this.db.query(
      'SELECT apply_billing_event($1::jsonb) AS outcome',
      [JSON.stringify(event)],
    );
    // Durable outbox: retries still drain this after an already-processed refund.
    const cancellations = await this.db.query(
      'SELECT subscription_id FROM billing_cancellations WHERE mode=$1 AND completed_at IS NULL LIMIT 10',
      [this.config.mode],
    );
    for (const row of cancellations) {
      const subscriptionId = z
        .string()
        .regex(/^sub_[A-Za-z0-9]+$/)
        .parse(row.subscription_id);
      const current = await this.provider.request(
        `subscriptions?subscription_id=${encodeURIComponent(subscriptionId)}`,
      );
      if (current.mode !== providerMode(this.config))
        throw new Error('Subscription environment mismatch.');
      if (!['canceled', 'expired'].includes(String(current.status))) {
        const canceled = await this.provider.request(
          `subscriptions/${subscriptionId}/cancel`,
          { mode: 'immediate' },
          `refund-cancel-${subscriptionId}`,
        );
        if (
          canceled.mode !== providerMode(this.config) ||
          canceled.id !== subscriptionId ||
          canceled.status !== 'canceled'
        )
          throw new Error('Refund cancellation has not been confirmed.');
      }
      await this.db.query(
        'UPDATE billing_cancellations SET completed_at=NOW() WHERE mode=$1 AND subscription_id=$2',
        [this.config.mode, subscriptionId],
      );
    }
    return String(result[0]?.outcome ?? 'processed');
  }
  async summary(userId: string) {
    await this.db.query('SELECT refresh_credit_wallet($1)', [userId]);
    const batches = await this.db.query(
      `SELECT id,kind,granted,remaining,consumed,paid_at AS "paidAt",expires_at AS "expiresAt",revoked_at AS "revokedAt",
      (price_cents>0 AND revoked_at IS NULL AND consumed=0 AND paid_at>=NOW()-INTERVAL '7 days' AND NOT EXISTS(SELECT 1 FROM credit_allocations a JOIN credit_reservations r ON r.id=a.reservation_id WHERE a.batch_id=b.id AND r.status='reserved')) AS "refundEligible"
      FROM credit_batches b WHERE user_id=$1 ORDER BY paid_at DESC LIMIT 100`,
      [userId],
    );
    const subscriptions = await this.db.query(
      'SELECT id,status,period_end AS "periodEnd" FROM billing_subscriptions WHERE user_id=$1 AND mode=$2 ORDER BY period_end DESC LIMIT 10',
      [userId, this.config.mode],
    );
    return { enabled: true, mode: this.config.mode, batches, subscriptions };
  }
  async cancel(userId: string, subscriptionId: string) {
    const [row] = await this.db.query(
      'SELECT id,status FROM billing_subscriptions WHERE user_id=$1 AND mode=$2 AND id=$3',
      [userId, this.config.mode, subscriptionId],
    );
    if (!row) throw new Error('Subscription not found.');
    if (
      ['scheduled_cancel', 'canceled', 'expired'].includes(String(row.status))
    )
      return { canceled: true };
    const result = await this.provider.request(
      `subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
      { mode: 'scheduled', onExecute: 'cancel' },
      `scheduled-cancel-${subscriptionId}`,
    );
    if (
      result.mode !== providerMode(this.config) ||
      result.id !== subscriptionId ||
      !['scheduled_cancel', 'canceled'].includes(String(result.status))
    )
      throw new Error('Cancellation has not been confirmed.');
    await this.db.query(
      'UPDATE billing_subscriptions SET status=$3,last_event_at=GREATEST(last_event_at,NOW()) WHERE mode=$1 AND id=$2',
      [this.config.mode, subscriptionId, result.status],
    );
    return { canceled: true };
  }
  async portal(userId: string) {
    const [row] = await this.db.query(
      'SELECT customer_id FROM billing_orders WHERE user_id=$1 AND mode=$2 AND customer_id IS NOT NULL ORDER BY created_at DESC LIMIT 1',
      [userId, this.config.mode],
    );
    if (!row) throw new Error('No subscription billing account yet.');
    const result = await this.provider.request('customers/billing', {
      customer_id: row.customer_id,
    });
    return { url: hostedUrl(result.customer_portal_link, this.config.mode) };
  }
}
