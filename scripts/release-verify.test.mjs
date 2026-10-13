import test from 'node:test';
import assert from 'node:assert/strict';
import { releasePlan } from './release-verify.mjs';
test('release refuses live production environment before invoking commands', () => {
  assert.throws(() => releasePlan({ VERCEL_ENV: 'production', BILLING_MODE: 'live' }), /production/i);
});
test('release retains audit and full verification once, without production smoke', () => {
  const plan = releasePlan({});
  assert.deepEqual(plan, [['audit', '--audit-level=high'], ['run', 'site:validate'], ['run', 'verify']]);
  assert.equal(plan.filter(p => p.includes('verify')).length, 1);
});
