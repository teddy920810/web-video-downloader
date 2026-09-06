import type { ToolAccount, UsageRecord } from '../../lib/credits/credit-service';
export const accountSections = [
  { id: 'overview', label: 'Overview', href: '/account' },
  { id: 'profile', label: 'Profile', href: '/account/profile' },
  { id: 'credits', label: 'Subscription & Credits', href: '/account/credits' },
  { id: 'redeem', label: 'Redeem Code', href: '/account/redeem' },
  { id: 'security', label: 'Security & Privacy', href: '/account/security' },
  { id: 'help', label: 'Help & Support', href: '/account/help' },
] as const;
export type AccountSection = typeof accountSections[number]['id'];
export type AccountPayload = {
  account: ToolAccount;
  preferences: { nickname: string; marketingOptIn: boolean };
  usage: UsageRecord[];
  reservedCredits: number;
  ledger: Array<{ id: string; eventType: string; freeDelta: number; paidDelta: number; createdAt: string }>;
  redemptions: Array<{ id: string; label: string; credits: number; createdAt: string }>;
  canGrantTestCredits: boolean;
};
export type CodeList = {
  codes: Array<{ id: string; label: string; credits: number; maxUses: number; usedCount: number; expiresAt: string; disabled: boolean }>;
  redemptions: Array<{ codeId: string; userId: string; label: string; credits: number; createdAt: string }>;
};
export function dateLabel(value: string) { return new Date(value).toLocaleString(); }
