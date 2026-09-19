import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const vercelIgnore = readFileSync(new URL('../../../.vercelignore', import.meta.url), 'utf8');

describe('Vercel deployment inputs', () => {
  it('keeps the public environment template required by site validation', () => {
    expect(vercelIgnore).toContain('!.env.example');
  });
  it('excludes private credentials and billing backups from direct deployments', () => {
    expect(vercelIgnore.split(/\r?\n/)).toContain('.secrets/');
  });
});
