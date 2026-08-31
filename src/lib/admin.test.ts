import { describe, expect, it } from 'vitest';
import { isAdminEmail } from './admin';

describe('admin allowlist', () => {
  it('fails closed when the allowlist is missing', () => expect(isAdminEmail('owner@example.com', undefined)).toBe(false));
  it('matches normalized complete email addresses only', () => {
    expect(isAdminEmail('Owner@Example.com', 'person@example.com, owner@example.com')).toBe(true);
    expect(isAdminEmail('owner@example.co', 'owner@example.com')).toBe(false);
  });
});
