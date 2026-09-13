import { PRODUCT_PLANS } from './catalog';

// Published launch prices. No checkout or credit grants are enabled here.
export const PRO_OFFER = { priceCents: 499, credits: PRODUCT_PLANS.pro.monthlyCredits } as const;
export const CREDIT_PACKS = [
  { credits: 300, priceCents: 450 },
  { credits: 1000, priceCents: 1500 },
  { credits: 2000, priceCents: 3000 },
  { credits: 10000, priceCents: 15000 },
] as const;
export const usd = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
export const creditCount = (credits: number) => credits.toLocaleString('en-US');
