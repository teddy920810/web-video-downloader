import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./ProcessingOverlay.tsx', import.meta.url), 'utf8');

describe('ProcessingOverlay', () => {
  it('announces a shared busy state and optional progress', () => {
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('aria-busy="true"');
    expect(source).toContain('Math.round(normalized * 100)');
    expect(source).toContain('<progress');
  });
});
