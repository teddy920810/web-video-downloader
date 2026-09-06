import { createHash } from 'node:crypto';
import { z } from 'zod';

export const profileSchema = z.object({
  nickname: z.string().trim().max(80).refine((value) => [...value].every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)),
  marketingOptIn: z.boolean(),
}).strict();
export function normalizeRewardCode(code: string) { return code.trim().replaceAll('-', '').toUpperCase(); }
export function hashRewardCode(code: string) { return createHash('sha256').update(normalizeRewardCode(code)).digest('hex'); }
export const rewardSchema = z.object({ code: z.string().max(64).transform(normalizeRewardCode).pipe(z.string().regex(/^[A-F0-9]{32}$/)) }).strict();
export const createCodeSchema = z.object({
  label: z.string().trim().min(1).max(80),
  credits: z.number().int().min(1).max(1000),
  maxUses: z.number().int().min(1).max(10000),
  expiresAt: z.iso.datetime().refine((value) => Date.parse(value) > Date.now(), 'Expiry must be in the future.'),
  requestId: z.uuid(),
}).strict();
export const disableCodeSchema = z.object({ id: z.uuid() }).strict();
