import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { billingConfig, canStartCheckout, normalizeEvent, verifySignature, type BillingConfig } from './contracts';
import { BillingService, CreemClient } from './service';

const settings: Record<string, string> = {
  BILLING_MODE: 'live', VERCEL_ENV: 'production', CREEM_API_KEY: 'creem_live_fixture',
  CREEM_WEBHOOK_SECRET: 'live-secret', DATABASE_URL: 'postgres://user:secret@production.test/main',
  BILLING_TEST_DATABASE_URL: 'postgres://user:secret@sandbox.test/test',
  CREEM_PRODUCT_IDS: JSON.stringify({ 'pro-monthly-500': 'prod_pro', 'pack-300': 'prod_pack',
    'pack-1000': 'prod_pack1000', 'pack-2000': 'prod_pack2000', 'pack-10000': 'prod_pack10000' }),
};
const live = (overrides: Record<string, string | undefined> = {}) => billingConfig(key => ({ ...settings, ...overrides })[key])!;
const user = { id: 'owner', email: 'owner@example.test' };
const uuid = 'd8cafbeb-03dd-44d1-a517-ea7e3ea5910a';

describe('live billing boundary', () => {
  it('uses the production wallet but keeps checkout closed until explicitly enabled', () => {
    expect(live()).toMatchObject({ mode: 'live', databaseUrl: settings.DATABASE_URL });
    expect(canStartCheckout(live(), user.email)).toBe(false);
    const validation = live({ BILLING_CHECKOUT_ACCESS: 'validation', BILLING_VALIDATION_EMAILS: ' Owner@example.test ' });
    expect(canStartCheckout(validation, user.email)).toBe(true);
    expect(canStartCheckout(validation, 'other@example.test')).toBe(false);
    expect(canStartCheckout(validation)).toBe(false);
    expect(canStartCheckout(live({ BILLING_CHECKOUT_ACCESS: 'open' }))).toBe(true);
  });
  it('rejects mixed credentials, preview live mode, incomplete catalogs and shared sandbox databases', () => {
    for (const changes of [
      { CREEM_API_KEY: 'creem_test_example' }, { CREEM_WEBHOOK_SECRET: '' }, { VERCEL_ENV: 'preview' },
      { CREEM_PRODUCT_IDS: '{"pack-300":"prod_pack"}' }, { BILLING_CHECKOUT_ACCESS: 'typo' },
      { BILLING_CHECKOUT_ACCESS: 'validation', BILLING_VALIDATION_EMAILS: 'not-an-email' },
      { BILLING_TEST_DATABASE_URL: 'postgres://other:other@production-pooler.test/main?sslmode=require' },
    ]) expect(() => live(changes)).toThrow();
    expect(() => billingConfig(key => ({ ...settings, BILLING_MODE: 'test', VERCEL_ENV: 'preview',
      CREEM_API_KEY: 'creem_test_example', BILLING_TEST_DATABASE_URL: 'postgres://other@production-pooler.test/main' })[key])).toThrow();
  });
  it('maps provider prod events to the live ledger and rejects test events and test signatures', () => {
    const event = { id: 'evt_live', eventType: 'checkout.completed', created_at: Date.now(), object: {
      id: 'ch_live', mode: 'prod', status: 'completed', customer: 'cust_one', product: 'prod_pack',
      metadata: { referenceId: uuid }, order: { id: 'ord_one', status: 'paid', currency: 'USD',
        amount: 450, amount_paid: 450, type: 'onetime', created_at: '2026-09-19T00:00:00Z' },
    } };
    expect(normalizeEvent(event, live())).toMatchObject({ mode: 'live', action: 'grant', credits: 300, expiresAt: '2028-09-19T00:00:00.000Z' });
    expect(() => normalizeEvent({ ...event, object: { ...event.object, mode: 'test' } }, live())).toThrow();
    const raw = JSON.stringify(event);
    expect(verifySignature(raw, createHmac('sha256', 'test-secret').update(raw).digest('hex'), live().webhookSecret)).toBe(false);
  });
  it('uses only the live API for live credentials', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    await new CreemClient(live(), fetcher).request('products/search');
    expect(fetcher).toHaveBeenCalledWith('https://api.creem.io/v1/products/search', expect.objectContaining({ redirect: 'error' }));
  });
  it('allows approved live checkout, rejects test URLs and enforces closure before creating any order', async () => {
    const query = vi.fn().mockResolvedValue([{ id: uuid, status: 'pending' }]);
    const request = vi.fn().mockResolvedValue({ id: 'ch_live', mode: 'prod', checkout_url: 'https://www.creem.io/checkout/prod_pack/ch_live' });
    const service = (config: BillingConfig) => new BillingService({ query }, { request }, config);
    await expect(service(live()).checkout(user, 'pack-300', uuid, 'https://www.streamnest.io')).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
    const config = live({ BILLING_CHECKOUT_ACCESS: 'validation', BILLING_VALIDATION_EMAILS: user.email });
    await expect(service(config).checkout(user, 'pack-300', uuid, 'https://www.streamnest.io')).resolves.toEqual({ url: 'https://www.creem.io/checkout/prod_pack/ch_live' });
    for (const checkout_url of ['https://creem.io/test/payment/ch_live', 'https://test-checkout.creem.io/payment/ch_live', 'https://evil.test/payment/ch_live']) {
      request.mockResolvedValue({ id: 'ch_live', mode: 'prod', checkout_url });
      await expect(service(config).checkout(user, 'pack-300', uuid, 'https://www.streamnest.io')).rejects.toThrow();
    }
  });
});
