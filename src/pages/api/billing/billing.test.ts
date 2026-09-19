import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { getBilling, getSession, getCreditService, service } = vi.hoisted(
  () => ({
    getBilling: vi.fn(),
    getSession: vi.fn(),
    getCreditService: vi.fn(),
    service: {
      checkout: vi.fn(),
      apply: vi.fn(),
      summary: vi.fn(),
      cancel: vi.fn(),
      portal: vi.fn(),
    },
  }),
);
vi.mock('../../../lib/billing/runtime', () => ({ getBilling }));
vi.mock('../../../lib/auth', () => ({ getSession }));
vi.mock('../../../lib/credits/services', () => ({ getCreditService }));
import { ALL } from './[action]';
const user = { id: 'one', email: 'one@example.test' };
function context(
  action = 'checkout',
  body: unknown = { offer: 'pack-300', requestId: crypto.randomUUID() },
  headers: Record<string, string> = {},
) {
  return {
    params: { action },
    request: new Request(`https://example.test/api/billing/${action}`, {
      method: action === 'status' ? 'GET' : 'POST',
      headers: {
        origin: 'https://example.test',
        'content-type': 'application/json',
        ...headers,
      },
      body:
        action === 'status'
          ? undefined
          : typeof body === 'string'
            ? body
            : JSON.stringify(body),
    }),
  } as unknown as Parameters<typeof ALL>[0];
}
describe('billing endpoints', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getBilling.mockReturnValue({
      config: { mode: 'test', webhookSecret: 'secret' },
      service,
    });
    getSession.mockResolvedValue({ user });
    getCreditService.mockReturnValue({ getOrCreateAccount: vi.fn() });
    service.checkout.mockResolvedValue({
      url: 'https://creem.io/test/payment/ch_one',
    });
    service.summary.mockResolvedValue({ enabled: true, batches: [] });
  });
  it('keeps payments closed by default', async () => {
    getBilling.mockReturnValue(null);
    expect((await ALL(context())).status).toBe(503);
    expect(await (await ALL(context('status'))).json()).toEqual({
      enabled: false,
    });
  });
  it('requires login and a same-origin request', async () => {
    getSession.mockResolvedValue(null);
    expect((await ALL(context())).status).toBe(401);
    expect(
      (await ALL(context('checkout', {}, { origin: 'https://evil.test' })))
        .status,
    ).toBe(403);
    expect(service.checkout).not.toHaveBeenCalled();
  });
  it('associates checkout only with the session owner and rejects price overrides', async () => {
    const input = { offer: 'pack-300', requestId: crypto.randomUUID() };
    expect((await ALL(context('checkout', input))).status).toBe(200);
    expect(service.checkout).toHaveBeenCalledWith(
      user,
      input.offer,
      input.requestId,
      'https://example.test',
    );
    expect(
      (await ALL(context('checkout', { ...input, userId: 'other' }))).status,
    ).toBe(400);
  });
  it('never treats a return redirect as payment proof', async () => {
    expect((await ALL(context('status'))).status).toBe(200);
    expect(service.apply).not.toHaveBeenCalled();
  });
  it('keeps live checkout closed for unapproved users while allowing account management', async () => {
    getBilling.mockReturnValue({ config: { mode: 'live', checkoutAccess: 'validation', validationEmails: ['owner@example.test'] }, service });
    expect((await ALL(context())).status).toBe(403);
    expect(service.checkout).not.toHaveBeenCalled();
    expect((await ALL(context('status'))).status).toBe(200);
    getSession.mockResolvedValue({ user: { ...user, email: 'owner@example.test' } });
    expect((await ALL(context())).status).toBe(200);
  });
  it('checks webhook signatures before parsing or accessing users', async () => {
    expect((await ALL(context('webhook', 'invalid'))).status).toBe(401);
    expect(service.apply).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
  });
  it('accepts a signed event without browser login and responds only after processing', async () => {
    const raw = JSON.stringify({
      id: 'evt_one',
      created_at: Date.now(),
      eventType: 'unknown',
      object: { mode: 'test' },
    });
    const signature = createHmac('sha256', 'secret').update(raw).digest('hex');
    service.apply.mockResolvedValue('ignore');
    expect(
      await (
        await ALL(context('webhook', raw, { 'creem-signature': signature }))
      ).json(),
    ).toEqual({ received: true, outcome: 'ignore' });
    expect(getSession).not.toHaveBeenCalled();
    service.apply.mockRejectedValue(new Error('secret'));
    const r = await ALL(
      context('webhook', raw, { 'creem-signature': signature }),
    );
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain('secret');
  });
  it('bounds bodies and handles malformed input', async () => {
    expect((await ALL(context('checkout', 'x'.repeat(5000)))).status).toBe(413);
    expect((await ALL(context('checkout', '{'))).status).toBe(400);
  });
  it('routes owned subscription cancellation and portal requests', async () => {
    await ALL(context('cancel', { subscriptionId: 'sub_one' }));
    expect(service.cancel).toHaveBeenCalledWith('one', 'sub_one');
    await ALL(context('portal', {}));
    expect(service.portal).toHaveBeenCalledWith('one');
    expect((await ALL(context('portal', { customerId: 'other' }))).status).toBe(
      400,
    );
  });
  it('rejects unknown routes and methods', async () => {
    expect((await ALL(context('forged'))).status).toBe(404);
    const c = context();
    c.request = new Request(c.request.url);
    expect((await ALL(c)).status).toBe(405);
  });
});
