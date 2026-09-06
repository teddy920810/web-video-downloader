import { describe, expect, it } from 'vitest';
import { profileSchema, rewardSchema, createCodeSchema, hashRewardCode, normalizeRewardCode } from './contracts';

describe('account contracts', () => {
  it('keeps the profile minimal and marketing explicitly opt-in', () => {
    expect(profileSchema.parse({ nickname: '  Sam  ', marketingOptIn: false })).toEqual({ nickname: 'Sam', marketingOptIn: false });
    expect(profileSchema.safeParse({ nickname: 'Sam', email: 'other@example.com', marketingOptIn: true }).success).toBe(false);
    expect(profileSchema.safeParse({ nickname: 'Sam' }).success).toBe(false);
    expect(profileSchema.safeParse({ nickname: 'x'.repeat(81), marketingOptIn: false }).success).toBe(false);
  });
  it('normalizes codes and stores no recoverable code', () => {
    const code = ' abcd-ef12-3456-7890-abcd-ef12-3456-7890 ';
    expect(normalizeRewardCode(code)).toBe('ABCDEF1234567890ABCDEF1234567890');
    expect(hashRewardCode(code)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashRewardCode(code)).toBe(hashRewardCode(normalizeRewardCode(code)));
    expect(rewardSchema.safeParse({ code: 'short' }).success).toBe(false);
    expect(rewardSchema.safeParse({ code, credits: 100 }).success).toBe(false);
  });
  it('bounds administrative grants and forbids past expiry', () => {
    const input = { label: 'QA', credits: 1, maxUses: 1, expiresAt: new Date(Date.now() + 86400000).toISOString(), requestId: crypto.randomUUID() };
    expect(createCodeSchema.safeParse(input).success).toBe(true);
    for (const change of [{ credits: 0 }, { credits: 1001 }, { maxUses: 0 }, { expiresAt: '2020-01-01T00:00:00.000Z' }]) {
      expect(createCodeSchema.safeParse({ ...input, ...change }).success).toBe(false);
    }
  });
});
