import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingService, CreemClient } from './service';
import type { BillingConfig, BillingEvent } from './contracts';
const config: BillingConfig = {
  mode: 'test',
  apiKey: 'creem_test_example',
  webhookSecret: 'secret',
  databaseUrl: 'postgres://isolated',
  products: { 'pack-300': 'prod_pack', 'pro-monthly-500': 'prod_pro' },
};
const query = vi.fn();
const request = vi.fn();
const service = () => new BillingService({ query }, { request }, config);
const user = { id: 'u1', email: 'one@example.test' };
const uuid = 'd8cafbeb-03dd-44d1-a517-ea7e3ea5910a';
describe('billing service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    query.mockResolvedValue([]);
  });
  it('replaces a provider-confirmed expired checkout with a persisted retry order', async () => {
    const replacement = '4d2bafbc-f597-4d67-8772-e27c65f11650';
    query
      .mockResolvedValueOnce([
        {
          id: uuid,
          status: 'created',
          checkout_id: 'ch_old',
          checkout_url: 'https://creem.io/test/payment/ch_old',
        },
      ])
      .mockResolvedValueOnce([{ id: replacement, status: 'pending' }])
      .mockResolvedValueOnce([{ id: replacement }]);
    request
      .mockResolvedValueOnce({ id: 'ch_old', mode: 'test', status: 'expired' })
      .mockResolvedValueOnce({
        id: 'ch_new',
        mode: 'test',
        checkout_url: 'https://creem.io/test/payment/ch_new',
      });
    expect(
      await service().checkout(user, 'pack-300', uuid, 'https://example.test'),
    ).toEqual({ url: 'https://creem.io/test/payment/ch_new' });
    expect(request).toHaveBeenLastCalledWith(
      'checkouts',
      expect.objectContaining({
        request_id: replacement,
        metadata: { referenceId: replacement },
      }),
      `checkout-${replacement}`,
    );
  });
  it('persists identity before creating a checkout, retries with the same provider key, and stores the URL', async () => {
    query
      .mockResolvedValueOnce([{ id: uuid, status: 'pending' }])
      .mockResolvedValueOnce([{ id: uuid }]);
    request.mockResolvedValue({
      id: 'ch_one',
      mode: 'test',
      checkout_url: 'https://creem.io/test/payment/ch_one',
    });
    expect(
      await service().checkout(user, 'pack-300', uuid, 'https://example.test'),
    ).toEqual({ url: 'https://creem.io/test/payment/ch_one' });
    expect(request).toHaveBeenCalledWith(
      'checkouts',
      expect.objectContaining({
        product_id: 'prod_pack',
        request_id: uuid,
        metadata: { referenceId: uuid },
        customer: { email: user.email },
        success_url: 'https://example.test/account/credits?checkout=returned',
      }),
      `checkout-${uuid}`,
    );
  });
  it('reuses an existing checkout and returns paid orders to the account', async () => {
    query.mockResolvedValue([
      {
        id: uuid,
        status: 'created',
        checkout_url: 'https://creem.io/test/payment/ch_one',
        checkout_id: 'ch_one',
      },
    ]);
    request.mockResolvedValue({
      id: 'ch_one',
      mode: 'test',
      status: 'pending',
    });
    await service().checkout(user, 'pack-300', uuid, 'https://example.test');
    expect(request).toHaveBeenCalledWith('checkouts?checkout_id=ch_one');
    query.mockResolvedValue([{ id: uuid, status: 'paid' }]);
    expect(
      await service().checkout(user, 'pack-300', uuid, 'https://example.test'),
    ).toEqual({
      url: 'https://example.test/account/credits?checkout=returned',
    });
  });
  it('fails closed on missing orders, wrong-mode responses, malicious URLs and unknown offers', async () => {
    await expect(
      service().checkout(user, 'unknown', uuid, 'https://example.test'),
    ).rejects.toThrow();
    await expect(
      service().checkout(user, 'pack-300', uuid, 'https://example.test'),
    ).rejects.toThrow();
    for (const result of [
      {
        id: 'ch_one',
        mode: 'live',
        checkout_url: 'https://creem.io/test/payment/ch_one',
      },
      {
        id: 'ch_one',
        mode: 'test',
        checkout_url: 'https://evil.test/test/charge',
      },
      {
        id: 'ch_one',
        mode: 'test',
        checkout_url: 'https://creem.io/payment/ch_one',
      },
    ]) {
      query.mockResolvedValue([{ id: uuid, status: 'pending' }]);
      request.mockResolvedValue(result);
      await expect(
        service().checkout(user, 'pack-300', uuid, 'https://example.test'),
      ).rejects.toThrow();
    }
  });
  it('requires ownership and explicitly schedules cancellation at period end', async () => {
    await expect(service().cancel('u1', 'sub_one')).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
    query.mockResolvedValue([{ id: 'sub_one', status: 'active' }]);
    request.mockResolvedValue({
      id: 'sub_one',
      mode: 'test',
      status: 'scheduled_cancel',
    });
    expect(await service().cancel('u1', 'sub_one')).toEqual({ canceled: true });
    expect(request).toHaveBeenCalledWith(
      'subscriptions/sub_one/cancel',
      { mode: 'scheduled', onExecute: 'cancel' },
      'scheduled-cancel-sub_one',
    );
    query.mockResolvedValue([{ id: 'sub_one', status: 'scheduled_cancel' }]);
    request.mockClear();
    await service().cancel('u1', 'sub_one');
    expect(request).not.toHaveBeenCalled();
    query.mockResolvedValue([{ id: 'sub_one', status: 'active' }]);
    request.mockResolvedValue({
      id: 'other',
      mode: 'test',
      status: 'scheduled_cancel',
    });
    await expect(service().cancel('u1', 'sub_one')).rejects.toThrow();
  });
  it('retrieves only the account owner’s billing portal', async () => {
    await expect(service().portal('u1')).rejects.toThrow();
    query.mockResolvedValue([{ customer_id: 'cust_one' }]);
    request.mockResolvedValue({
      customer_portal_link: 'https://creem.io/my-orders',
    });
    expect(await service().portal('u1')).toEqual({
      url: 'https://creem.io/my-orders',
    });
    expect(request).toHaveBeenCalledWith('customers/billing', {
      customer_id: 'cust_one',
    });
  });
  it('refreshes expiry before returning batches and subscriptions', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'batch' }])
      .mockResolvedValueOnce([{ id: 'sub_one' }]);
    expect(await service().summary('u1')).toMatchObject({
      enabled: true,
      batches: [{ id: 'batch' }],
      subscriptions: [{ id: 'sub_one' }],
    });
    expect(query.mock.calls[0][0]).toContain('refresh_credit_wallet');
  });
  it('drains durable refund cancellation even when the payment event was already handled', async () => {
    query
      .mockResolvedValueOnce([{ outcome: 'duplicate' }])
      .mockResolvedValueOnce([{ subscription_id: 'sub_one' }])
      .mockResolvedValue([]);
    request
      .mockResolvedValueOnce({ mode: 'test', status: 'active' })
      .mockResolvedValueOnce({
        id: 'sub_one',
        mode: 'test',
        status: 'canceled',
      });
    expect(await service().apply({ eventId: 'evt_one' } as BillingEvent)).toBe(
      'duplicate',
    );
    expect(request).toHaveBeenCalledWith(
      'subscriptions/sub_one/cancel',
      { mode: 'immediate' },
      'refund-cancel-sub_one',
    );
  });
  it('confirms an ambiguous refund against the provider before revoking credits', async () => {
    request.mockResolvedValue({id:'tran_one',mode:'test',status:'refunded',amount_paid:499,refunded_amount:499,order:'ord_one'});
    const refund = {eventId:'evt_refund',eventType:'refund.created',mode:'test',action:'review',paymentKeys:['transaction:tran_one'],status:'refunded'} as BillingEvent;
    await service().apply(refund);
    expect(request).toHaveBeenCalledWith('transactions?transaction_id=tran_one');
    expect(JSON.parse(query.mock.calls[0][1][0])).toMatchObject({eventId:'evt_refund',action:'revoke',paymentKeys:['transaction:tran_one','order:ord_one']});
  });
  it('keeps a confirmed partial refund in review', async () => {
    request.mockResolvedValue({id:'tran_one',mode:'test',status:'partialRefund',amount_paid:499,refunded_amount:100});
    await service().apply({eventType:'refund.created',action:'review',paymentKeys:['transaction:tran_one']} as BillingEvent);
    expect(JSON.parse(query.mock.calls[0][1][0]).action).toBe('review');
  });
  it('does not acknowledge an ambiguous refund when provider verification fails', async () => {
    const refund = {eventType:'refund.created',action:'review',paymentKeys:['transaction:tran_one']} as BillingEvent;
    for (const result of [{id:'tran_other',mode:'test'},{id:'tran_one',mode:'prod'}]) {
      request.mockResolvedValue(result);
      await expect(service().apply(refund)).rejects.toThrow();
    }
    request.mockRejectedValue(new Error('temporarily unavailable'));
    await expect(service().apply(refund)).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
  it('retries cancellations after provider failure and rejects wrong environment', async () => {
    query
      .mockResolvedValueOnce([{ outcome: 'duplicate' }])
      .mockResolvedValueOnce([{ subscription_id: 'sub_one' }]);
    request.mockResolvedValue({ mode: 'live', status: 'active' });
    await expect(service().apply({} as BillingEvent)).rejects.toThrow();
    expect(query).toHaveBeenCalledTimes(2);
    query
      .mockReset()
      .mockResolvedValueOnce([{ outcome: 'duplicate' }])
      .mockResolvedValueOnce([{ subscription_id: 'sub_one' }])
      .mockResolvedValue([]);
    request.mockResolvedValue({ mode: 'test', status: 'canceled' });
    await service().apply({} as BillingEvent);
  });
});
describe('Creem transport', () => {
  it('uses only the official test API, sends secrets in headers, and bounds requests', async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(
        async () => new Response(JSON.stringify({ id: 'ch_one' })),
      );
    const client = new CreemClient(config, fetcher);
    await client.request('checkouts', { product_id: 'prod_pack' }, 'stable');
    expect(fetcher).toHaveBeenCalledWith(
      'https://test-api.creem.io/v1/checkouts',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'x-api-key': config.apiKey,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'stable',
        },
        redirect: 'error',
      }),
    );
    await client.request('subscriptions?subscription_id=sub_one');
    expect(fetcher.mock.calls[1][1].method).toBe('GET');
    fetcher.mockResolvedValue(
      new Response('secret provider detail', { status: 500 }),
    );
    await expect(client.request('checkouts', {})).rejects.toThrow(
      'temporarily unavailable',
    );
  });
});
