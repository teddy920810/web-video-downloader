import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { legalPageSchema } from './marketing-settings';

const readLegal = (name: string) => readFileSync(new URL(`../../content/legal/${name}.md`, import.meta.url), 'utf8');

describe('Streamnest legal content', () => {
  it('supports all three fixed legal routes', () => {
    for (const slug of ['privacy', 'terms', 'refund-policy']) {
      expect(legalPageSchema.safeParse({
        slug,
        title: `${slug} | Streamnest`,
        description: 'A product-specific Streamnest policy.',
        eyebrow: 'Legal',
        heading: 'Policy heading',
      }).success).toBe(true);
    }
  });

  it('documents the actual local, account, AI, storage, credit, and refund boundaries', () => {
    const privacy = readLegal('privacy');
    const terms = readLegal('terms');
    const refund = readLegal('refund-policy');

    expect(privacy).toMatch(/browser-local|in your browser/i);
    expect(privacy).toContain('Google');
    expect(privacy).toContain('Replicate');
    expect(privacy).toContain('Cloudflare R2');
    expect(privacy).toMatch(/access|delete|correct/i);
    expect(terms).toContain('AI credits');
    expect(terms).toContain('Acceptable use');
    expect(terms).toContain('Refund Policy');
    expect(refund).toContain('Paid checkout is not currently available');
    expect(refund).toMatch(/unused credits/i);
    expect(`${privacy}\n${terms}\n${refund}`).not.toMatch(/HitPaw|30-day money-back|Suite 902/i);
  });
});
