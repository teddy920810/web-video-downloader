import { getTool, type ToolId } from '../product/catalog';

export type AccountPlan = 'free' | 'pro';
export type AccountStatus = 'active' | 'past_due' | 'canceled';

export type ToolAccount = {
  userId: string;
  email: string;
  name: string | null;
  image: string | null;
  planId: AccountPlan;
  status: AccountStatus;
  freeCredits: number;
  paidCredits: number;
};

export type CreditReservation = {
  id: string;
  status: 'reserved' | 'consumed' | 'refunded';
  amount: number;
  freeCredits: number;
  paidCredits: number;
};

export type UsageRecord = {
  userId: string;
  toolId: ToolId;
  reservationId: string | null;
  status: 'succeeded' | 'failed';
  credits: number;
  sizeBytes?: number;
  durationMs: number;
  errorCode?: string;
};

export interface CreditStore {
  ensureAccount(profile: { id: string; email: string; name?: string | null; image?: string | null }): Promise<ToolAccount>;
  getAccount(userId: string): Promise<ToolAccount | null>;
  reserve(userId: string, toolId: ToolId, amount: number, idempotencyKey: string): Promise<CreditReservation | null>;
  consume(reservationId: string): Promise<void>;
  refund(reservationId: string): Promise<void>;
  recordUsage(record: UsageRecord): Promise<void>;
  listUsage(userId: string, limit: number): Promise<UsageRecord[]>;
}

export class InsufficientCreditsError extends Error {
  constructor() {
    super('You need one AI credit to use this tool.');
  }
}

export class CreditService {
  constructor(private readonly store: CreditStore) {}

  getOrCreateAccount(profile: { id: string; email: string; name?: string | null; image?: string | null }) {
    return this.store.ensureAccount(profile);
  }

  getAccount(userId: string) {
    return this.store.getAccount(userId);
  }

  listUsage(userId: string, limit = 20) {
    return this.store.listUsage(userId, Math.min(Math.max(limit, 1), 50));
  }

  async reserve(userId: string, toolId: ToolId, idempotencyKey: string) {
    const amount = getTool(toolId).credits;
    if (amount === 0) return { id: idempotencyKey, status: 'consumed', amount: 0, freeCredits: 0, paidCredits: 0, userId, toolId } as const;
    const reservation = await this.store.reserve(userId, toolId, amount, idempotencyKey);
    if (!reservation) throw new InsufficientCreditsError();
    return { ...reservation, userId, toolId };
  }

  async complete(reservation: CreditReservation & { userId: string; toolId: ToolId }, result: { sizeBytes?: number; durationMs: number }) {
    await this.store.consume(reservation.id);
    await this.store.recordUsage({ userId: reservation.userId, toolId: reservation.toolId, reservationId: reservation.id, status: 'succeeded', credits: reservation.amount, ...result });
  }

  async fail(reservation: CreditReservation & { userId: string; toolId: ToolId }, result: { durationMs: number; errorCode: string }) {
    await this.store.refund(reservation.id);
    await this.store.recordUsage({
      userId: reservation.userId,
      toolId: reservation.toolId,
      reservationId: reservation.id,
      status: 'failed',
      credits: reservation.amount,
      ...result,
    });
  }
}
