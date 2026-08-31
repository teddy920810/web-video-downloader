import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreditService, InsufficientCreditsError, type CreditStore } from './credit-service';

const account = {
  userId: 'google-user-1',
  email: 'person@example.com',
  name: 'Person',
  image: null,
  planId: 'free' as const,
  status: 'active' as const,
  freeCredits: 1,
  paidCredits: 0,
};

describe('credit service', () => {
  let store: CreditStore;
  let service: CreditService;

  beforeEach(() => {
    store = {
      ensureAccount: vi.fn().mockResolvedValue(account),
      getAccount: vi.fn().mockResolvedValue(account),
      reserve: vi.fn().mockResolvedValue({ id: 'reservation-1', status: 'reserved', amount: 1, freeCredits: 1, paidCredits: 0 }),
      consume: vi.fn().mockResolvedValue(undefined),
      refund: vi.fn().mockResolvedValue(undefined),
      recordUsage: vi.fn().mockResolvedValue(undefined),
      listUsage: vi.fn().mockResolvedValue([]),
    };
    service = new CreditService(store);
  });

  it('persists the signed-in profile and returns its wallet', async () => {
    await expect(service.getOrCreateAccount({ id: account.userId, email: account.email, name: account.name, image: null }))
      .resolves.toMatchObject({ freeCredits: 1, planId: 'free' });
    expect(store.ensureAccount).toHaveBeenCalledOnce();
  });

  it('reserves, consumes, and records a metered tool run', async () => {
    const reservation = await service.reserve(account.userId, 'background-remover', 'job-1');
    await service.complete(reservation, { sizeBytes: 1234, durationMs: 900 });
    expect(store.reserve).toHaveBeenCalledWith(account.userId, 'background-remover', 1, 'job-1');
    expect(store.consume).toHaveBeenCalledWith('reservation-1');
    expect(store.recordUsage).toHaveBeenCalledWith(expect.objectContaining({ status: 'succeeded', credits: 1 }));
  });

  it('refunds a failed provider run and records no secret detail', async () => {
    const reservation = await service.reserve(account.userId, 'background-remover', 'job-2');
    await service.fail(reservation, { durationMs: 400, errorCode: 'provider_unavailable' });
    expect(store.refund).toHaveBeenCalledWith('reservation-1');
    expect(store.recordUsage).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', errorCode: 'provider_unavailable' }));
  });

  it('maps an exhausted wallet to a stable product error', async () => {
    store.reserve = vi.fn().mockResolvedValue(null);
    await expect(service.reserve(account.userId, 'background-remover', 'job-3')).rejects.toBeInstanceOf(InsufficientCreditsError);
  });
});
