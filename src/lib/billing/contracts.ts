import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { CREDIT_PACKS, PRO_OFFER } from '../product/pricing';

export const offers: Record<
  string,
  { priceCents: number; credits: number; kind: 'pro' | 'pack' }
> = {
  'pro-monthly-500': { ...PRO_OFFER, kind: 'pro' as const },
  ...Object.fromEntries(
    CREDIT_PACKS.map((pack) => [
      `pack-${pack.credits}`,
      { ...pack, kind: 'pack' as const },
    ]),
  ),
};
export const offerKeys = [
  'pro-monthly-500',
  'pack-300',
  'pack-1000',
  'pack-2000',
  'pack-10000',
] as const;
export const checkoutInput = z
  .object({ offer: z.enum(offerKeys), requestId: z.uuid() })
  .strict();
export type BillingConfig = {
  mode: 'test' | 'live';
  apiKey: string;
  webhookSecret: string;
  databaseUrl: string;
  products: Record<string, string>;
  checkoutAccess?: 'closed' | 'validation' | 'open';
  validationEmails?: string[];
};

export const providerMode = (config: BillingConfig) => config.mode === 'live' ? 'prod' : 'test';

export function canStartCheckout(config: BillingConfig, email?: string) {
  const access = config.checkoutAccess ?? (config.mode === 'test' ? 'open' : 'closed');
  return access === 'open' || (access === 'validation' && !!email &&
    !!config.validationEmails?.includes(email.trim().toLowerCase()));
}

function databaseIdentity(value: string) {
  const url = new URL(value);
  return `${url.hostname.replace(/-pooler(?=\.)/, '')}${url.pathname}`;
}

// Sandbox wallets must never share the production account database.
export function billingConfig(
  read: (key: string) => string | undefined,
): BillingConfig | null {
  const mode = read('BILLING_MODE');
  if (!mode || mode === 'disabled') return null;
  if (!['test', 'live'].includes(mode) ||
    (mode === 'test' && read('VERCEL_ENV') === 'production') ||
    (mode === 'live' && read('VERCEL_ENV') === 'preview'))
    throw new Error('Billing is unavailable in this environment.');
  const apiKey = read('CREEM_API_KEY');
  const webhookSecret = read('CREEM_WEBHOOK_SECRET');
  const databaseUrl = read(mode === 'test' ? 'BILLING_TEST_DATABASE_URL' : 'DATABASE_URL');
  const normalDatabase = read('DATABASE_URL');
  const testDatabase = read('BILLING_TEST_DATABASE_URL');
  const validKey = mode === 'test' ? apiKey?.startsWith('creem_test_') :
    apiKey?.startsWith('creem_') && !apiKey.startsWith('creem_test_');
  if (
    !validKey || !apiKey ||
    !webhookSecret ||
    !databaseUrl ||
    (normalDatabase && testDatabase && databaseIdentity(normalDatabase) === databaseIdentity(testDatabase))
  )
    throw new Error('Billing credentials and database isolation are not configured.');
  const products = z
    .record(z.string(), z.string().regex(/^prod_[A-Za-z0-9]+$/))
    .parse(JSON.parse(read('CREEM_PRODUCT_IDS') ?? '{}'));
  if (
    !Object.keys(products).length || Object.keys(products).some(key => !offers[key]) ||
    (mode === 'live' && offerKeys.some(key => !products[key])) ||
    new Set(Object.values(products)).size !== Object.values(products).length
  )
    throw new Error('Invalid product mapping.');
  const checkoutAccess = z.enum(['closed', 'validation', 'open']).parse(
    read('BILLING_CHECKOUT_ACCESS') ?? (mode === 'test' ? 'open' : 'closed'));
  const validationEmails = (read('BILLING_VALIDATION_EMAILS') ?? '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  if (checkoutAccess === 'validation' && (!validationEmails.length || validationEmails.some(v => !z.email().safeParse(v).success)))
    throw new Error('Validation accounts must be configured.');
  return { mode: mode as 'test' | 'live', apiKey, webhookSecret, databaseUrl, products, checkoutAccess, validationEmails };
}

export function verifySignature(
  raw: string,
  signature: string | null,
  secret: string,
) {
  if (!signature || !/^[a-fA-F0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(
    Buffer.from(signature, 'hex'),
    createHmac('sha256', secret).update(raw).digest(),
  );
}

const object = z.record(z.string(), z.unknown());
const text = (value: unknown) => z.string().min(1).max(250).parse(value);
const id = (value: unknown): string =>
  typeof value === 'string' ? text(value) : text(object.parse(value).id);
const date = (value: unknown) => {
  if (typeof value !== 'string' && typeof value !== 'number')
    throw new Error('Missing payment date.');
  return new Date(z.coerce.date().parse(value)).toISOString();
};
function monthsAfter(value: string, months: number) {
  const time = new Date(value);
  const day = time.getUTCDate();
  time.setUTCDate(1);
  time.setUTCMonth(time.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(time.getUTCFullYear(), time.getUTCMonth() + 1, 0),
  ).getUTCDate();
  time.setUTCDate(Math.min(day, last));
  return time.toISOString();
}

export type BillingEvent = {
  eventId: string;
  eventType: string;
  eventAt: string;
  mode: 'test' | 'live';
  action:
    | 'grant'
    | 'checkout'
    | 'subscription'
    | 'revoke'
    | 'review'
    | 'ignore';
  referenceId?: string;
  productId?: string;
  customerId?: string;
  checkoutId?: string;
  offer?: string;
  paymentKey?: string;
  paymentKeys?: string[];
  subscriptionId?: string;
  credits?: number;
  priceCents?: number;
  kind?: 'pro' | 'pack';
  paidAt?: string;
  startsAt?: string;
  expiresAt?: string;
  status?: string;
};

// REST payloads use snake_case. Contract: https://docs.creem.io/code/webhooks
export function normalizeEvent(
  payload: unknown,
  config: BillingConfig,
): BillingEvent {
  const envelope = object.parse(payload);
  const data = object.parse(envelope.object);
  const event: BillingEvent = {
    eventId: text(envelope.id),
    eventType: text(envelope.eventType),
    eventAt: date(envelope.created_at),
    mode: config.mode,
    action: 'ignore',
  };
  if (data.mode !== providerMode(config))
    throw new Error('Webhook environment mismatch.');
  if (
    event.eventType === 'refund.created' ||
    event.eventType === 'dispute.created'
  ) {
    const transaction = object.parse(data.transaction);
    const keys = [`transaction:${id(transaction)}`];
    if (transaction.order) keys.push(`order:${id(transaction.order)}`);
    if (event.eventType === 'refund.created' && data.status !== 'succeeded')
      return event;
    const full =
      event.eventType === 'dispute.created' ||
      (typeof transaction.amount_paid === 'number' &&
        transaction.amount_paid > 0 &&
        Number(transaction.refunded_amount) >= transaction.amount_paid);
    return {
      ...event,
      action: full ? 'revoke' : 'review',
      paymentKeys: keys,
      status: event.eventType === 'dispute.created' ? 'disputed' : 'refunded',
    };
  }
  if (
    ![
      'checkout.completed',
      'subscription.paid',
      'subscription.active',
      'subscription.scheduled_cancel',
      'subscription.canceled',
      'subscription.past_due',
      'subscription.unpaid',
      'subscription.expired',
      'subscription.paused',
      'subscription.update',
    ].includes(event.eventType)
  )
    return event;
  const productId = id(data.product);
  const offer = Object.keys(config.products).find(
    (key) => config.products[key] === productId,
  );
  const catalog = offer ? offers[offer as keyof typeof offers] : undefined;
  if (!offer || !catalog) throw new Error('Unknown billing product.');
  const metadata = data.metadata == null ? {} : object.parse(data.metadata);
  const referenceId =
    metadata.referenceId === undefined
      ? undefined
      : z.uuid().parse(metadata.referenceId);
  const common = {
    ...event,
    offer,
    referenceId,
    productId,
    customerId: id(data.customer),
  };
  if (event.eventType === 'checkout.completed') {
    if (data.status !== 'completed')
      throw new Error('Checkout is not completed.');
    const order = object.parse(data.order);
    if (
      order.status !== 'paid' ||
      order.currency !== 'USD' ||
      order.amount !== catalog.priceCents
    )
      throw new Error('Order payment mismatch.');
    if (catalog.kind === 'pro')
      return {
        ...common,
        action: 'checkout',
        checkoutId: id(data),
        subscriptionId: id(data.subscription),
      };
    if (order.type !== 'onetime') throw new Error('Order type mismatch.');
    const paidAt = date(order.created_at);
    return {
      ...common,
      action: 'grant',
      checkoutId: id(data),
      kind: 'pack',
      paymentKey: `order:${id(order)}`,
      // Creem retains the catalog amount and reports discounts in amount_paid.
      priceCents: order.amount_paid === undefined
        ? catalog.priceCents
        : z.number().int().nonnegative().parse(order.amount_paid),
      credits: catalog.credits,
      paidAt,
      startsAt: paidAt,
      expiresAt: monthsAfter(paidAt, 24),
    };
  }
  if (catalog.kind !== 'pro') throw new Error('Subscription product mismatch.');
  const subscription = {
    ...common,
    subscriptionId: id(data),
    status: text(data.status),
    startsAt: date(data.current_period_start_date),
    expiresAt: date(data.current_period_end_date),
  };
  if (subscription.expiresAt <= subscription.startsAt)
    throw new Error('Invalid billing period.');
  if (event.eventType !== 'subscription.paid')
    return { ...subscription, action: 'subscription' };
  const product = object.parse(data.product);
  if (
    product.price !== catalog.priceCents ||
    product.currency !== 'USD' ||
    product.billing_type !== 'recurring' ||
    !['active', 'scheduled_cancel'].includes(subscription.status)
  )
    throw new Error('Subscription payment mismatch.');
  const transactionId = text(data.last_transaction_id);
  const transaction = data.last_transaction == null ? undefined : z.object({
    id: z.literal(transactionId),
    mode: z.literal(providerMode(config)),
    status: z.literal('paid'),
    currency: z.literal('USD'),
    subscription: z.literal(subscription.subscriptionId),
    amount_paid: z.number().int().nonnegative(),
  }).parse(data.last_transaction);
  return {
    ...subscription,
    action: 'grant',
    kind: 'pro',
    paymentKey: `transaction:${transactionId}`,
    credits: catalog.credits,
    priceCents: transaction?.amount_paid ?? catalog.priceCents,
    paidAt: date(data.last_transaction_date),
  };
}
