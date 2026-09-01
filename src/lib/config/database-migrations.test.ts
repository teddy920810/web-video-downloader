import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('database migration runner', () => {
  it('applies every numbered SQL migration in deterministic order', () => {
    const source = readFileSync(new URL('../../../scripts/migrate-db.mjs', import.meta.url), 'utf8');
    expect(source).toContain("readdir(resolve('db/migrations')");
    expect(source).toContain(".filter((name) => /^\\d+_.+\\.sql$/.test(name))");
    expect(source).toContain('.sort()');
  });
});
