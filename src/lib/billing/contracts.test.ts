import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  billingConfig,
  checkoutInput,
  normalizeEvent,
  verifySignature,
} from './contracts';

const config = () =>
  billingConfig(
    (key) =>
      ({
        BILLING_MODE: 'test',
        CREEM_API_KEY: 'creem_test_example',
        CREEM_WEBHOOK_SECRET: 'secret',
        BILLING_TEST_DATABASE_URL: 'postgres://isolated',
        CREEM_PRODUCT_IDS: JSON.stringify({
          'pro-monthly-500': 'prod_pro',
          'pack-300': 'prod_pack',
        }),
      })[key],
  );
const product = {
  id: 'prod_pro',
  price: 499,
  currency: 'USD',
  billing_type: 'recurring',
  mode: 'test',
};
const paid = () => ({
  id: 'evt_paid',
  eventType: 'subscription.paid',
  created_at: Date.now(),
  object: {
    id: 'sub_one',
    mode: 'test',
    status: 'active',
    product,
    customer: { id: 'cust_one' },
    metadata: { referenceId: 'd8cafbeb-03dd-44d1-a517-ea7e3ea5910a' },
    last_transaction_id: 'tran_one',
    last_transaction_date: '2026-09-13T00:00:00Z',
    current_period_start_date: '2026-09-13T00:00:00Z',
    current_period_end_date: '2026-10-13T00:00:00Z',
  },
});
describe('Creem payment contract', () => {
  it('defaults closed and rejects live credentials or a production test environment', () => {
    expect(billingConfig(() => undefined)).toBeNull();
    expect(() =>
      billingConfig((key) => (key === 'BILLING_MODE' ? 'test' : undefined)),
    ).toThrow();
    expect(() =>
      billingConfig((key) => (key === 'BILLING_MODE' ? 'live' : undefined)),
    ).toThrow();
    expect(() =>
      billingConfig((key) =>
        key === 'VERCEL_ENV' ? 'production' : { BILLING_MODE: 'test' }[key],
      ),
    ).toThrow();
  });
  it('only accepts catalog offers and a retry key, never browser-supplied prices or identities', () => {
    expect(
      checkoutInput.safeParse({
        offer: 'pack-300',
        requestId: crypto.randomUUID(),
      }).success,
    ).toBe(true);
    for (const extra of [{ userId: 'other' }, { price: 1 }, { credits: 10000 }])
      expect(
        checkoutInput.safeParse({
          offer: 'pack-300',
          requestId: crypto.randomUUID(),
          ...extra,
        }).success,
      ).toBe(false);
  });
  it('authenticates the exact raw body, including whitespace', () => {
    const body = '{ "id": "evt" }';
    const signature = createHmac('sha256', 'secret').update(body).digest('hex');
    expect(verifySignature(body, signature, 'secret')).toBe(true);
    expect(verifySignature(body.trim() + ' ', signature, 'secret')).toBe(false);
    expect(verifySignature(body, null, 'secret')).toBe(false);
    expect(verifySignature(body, 'xx', 'secret')).toBe(false);
  });
  it('grants subscriptions only for a paid transaction, using the provider billing period', () => {
    expect(normalizeEvent(paid(), config()!)).toMatchObject({
      action: 'grant',
      paymentKey: 'transaction:tran_one',
      credits: 500,
      kind: 'pro',
      expiresAt: '2026-10-13T00:00:00.000Z',
    });
    const active = paid();
    active.eventType = 'subscription.active';
    expect(normalizeEvent(active, config()!).action).toBe('subscription');
  });
  it('rejects wrong environment, prices, unknown products, invalid dates and untrusted references', () => {
    for (const changes of [
      { mode: 'prod' },
      { product: { ...product, price: 1 } },
      { product: { ...product, id: 'unknown' } },
      { current_period_end_date: '2026-01-01' },
      { metadata: { referenceId: 'not-uuid' } },
    ]) {
      expect(() =>
        normalizeEvent(
          { ...paid(), object: { ...paid().object, ...changes } },
          config()!,
        ),
      ).toThrow();
    }
  });
  it('grants one-time packs once per order and clamps leap-day 24-month expiry', () => {
    const event = {
      id: 'evt_pack',
      created_at: Date.now(),
      eventType: 'checkout.completed',
      object: {
        id: 'ch_pack',
        mode: 'test',
        status: 'completed',
        metadata: paid().object.metadata,
        customer: 'cust_one',
        product: {
          id: 'prod_pack',
          mode: 'test',
          price: 450,
          currency: 'USD',
          billing_type: 'onetime',
        },
        order: {
          id: 'ord_pack',
          amount: 450,
          currency: 'USD',
          status: 'paid',
          type: 'onetime',
          created_at: '2028-02-29T12:00:00Z',
        },
      },
    };
    expect(normalizeEvent(event, config()!)).toMatchObject({
      paymentKey: 'order:ord_pack',
      credits: 300,
      kind: 'pack',
      expiresAt: '2030-02-28T12:00:00.000Z',
    });
    event.object.order.status = 'pending';
    expect(() => normalizeEvent(event, config()!)).toThrow();
  });
  it('turns full refunds into revocations, retaining partial refunds for review', () => {
    const event = {
      id: 'evt_ref',
      created_at: Date.now(),
      eventType: 'refund.created',
      object: {
        id: 'ref_one',
        mode: 'test',
        status: 'succeeded',
        refund_amount: 499,
        transaction: {
          id: 'tran_one',
          amount_paid: 499,
          refunded_amount: 499,
          order: 'ord_one',
        },
      },
    };
    expect(normalizeEvent(event, config()!)).toMatchObject({
      action: 'revoke',
      paymentKeys: ['transaction:tran_one', 'order:ord_one'],
    });
    event.object.transaction.refunded_amount = 100;
    expect(normalizeEvent(event, config()!).action).toBe('review');
  });
  it('delivers a zero-total review pack while recording the actual amount paid', () => {
    const event = {
      id: 'evt_review_pack', eventType: 'checkout.completed', created_at: Date.now(),
      object: { id: 'ch_review', mode: 'test', status: 'completed',
        metadata: paid().object.metadata, customer: 'cust_one', product: 'prod_pack',
        order: { id: 'ord_review', amount: 450, amount_paid: 0, discount_amount: 450,
          currency: 'USD', status: 'paid', type: 'onetime', created_at: '2026-09-13T00:00:00Z' } },
    };
    expect(normalizeEvent(event, config()!)).toMatchObject({ action: 'grant', credits: 300, priceCents: 0 });
    for (const amount_paid of [-1, 0.5, '0'])
      expect(() => normalizeEvent({ ...event, object: { ...event.object, order: { ...event.object.order, amount_paid } } }, config()!)).toThrow();
    event.object.order.status = 'pending';
    expect(() => normalizeEvent(event, config()!)).toThrow();
  });
  it('records zero-total Pro transactions without trusting a mismatched transaction snapshot', () => {
    const original = paid();
    const transaction = { id: 'tran_one', mode: 'test', status: 'paid', currency: 'USD', amount_paid: 0, subscription: 'sub_one' };
    const event = { ...original, object: { ...original.object, last_transaction: transaction } };
    expect(normalizeEvent(event, config()!)).toMatchObject({ action: 'grant', credits: 500, priceCents: 0 });
    for (const changes of [{ id: 'tran_other' }, { mode: 'prod' }, { status: 'pending' }, { currency: 'EUR' }, { subscription: 'sub_other' }, { amount_paid: -1 }])
      expect(() => normalizeEvent({ ...event, object: { ...event.object, last_transaction: { ...transaction, ...changes } } }, config()!)).toThrow();
  });
});
