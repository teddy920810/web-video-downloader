import { describe, expect, it } from 'vitest';
import { validateBatchRange } from './batch-range';

describe('per-file range validation', () => {
  it('accepts ranges within the actual file duration', () => {
    expect(() => validateBatchRange(1, 3, 4)).not.toThrow();
    expect(() => validateBatchRange(0, 1, 1)).not.toThrow();
  });
  it('rejects missing metadata, invalid and out-of-bounds ranges without silent truncation', () => {
    for (const [start, end, duration] of [[0, 10, 2], [3, 4, 2], [2, 1, 4], [-1, 1, 4], [0, 1, NaN]]) {
      expect(() => validateBatchRange(start, end, duration)).toThrow();
    }
  });
});
