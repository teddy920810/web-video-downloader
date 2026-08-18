import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSecret, query, neon } = vi.hoisted(() => ({
  getSecret: vi.fn(),
  query: vi.fn(),
  neon: vi.fn(),
}));

vi.mock('astro:env/server', () => ({ getSecret }));
vi.mock('@neondatabase/serverless', () => ({ neon }));

import { createTrial, markTrialFailed, markTrialReady, TrialAlreadyUsedError } from './trial-store';

const input = {
  userId: 'google-user-1',
  userEmail: 'person@example.com',
  sourceUrl: 'https://www.youtube.com/watch?v=abc123',
  formatId: '18',
  title: 'Example video',
};

describe('trial store', () => {
  beforeEach(() => {
    getSecret.mockReturnValue('postgresql://example');
    neon.mockReturnValue(query);
    query.mockReset();
  });

  it('creates a queued trial and returns its stored record', async () => {
    query.mockResolvedValue([{ id: 'trial-1', ...input, status: 'queued', objectKey: null, failureReason: null }]);
    await expect(createTrial(input)).resolves.toMatchObject({ id: 'trial-1', status: 'queued' });
    expect(neon).toHaveBeenCalledWith('postgresql://example');
  });

  it('rejects an account whose existing trial is not retryable', async () => {
    query.mockResolvedValue([]);
    await expect(createTrial(input)).rejects.toBeInstanceOf(TrialAlreadyUsedError);
  });

  it('maps a database uniqueness race to the account limit error', async () => {
    query.mockRejectedValue({ code: '23505' });
    await expect(createTrial(input)).rejects.toBeInstanceOf(TrialAlreadyUsedError);
  });

  it('preserves operational database failures', async () => {
    query.mockRejectedValue(new Error('database unavailable'));
    await expect(createTrial(input)).rejects.toThrow('database unavailable');
  });

  it('requires the database connection setting', async () => {
    getSecret.mockReturnValue(undefined);
    await expect(createTrial(input)).rejects.toThrow('DATABASE_URL is not configured.');
  });

  it('records ready and failed terminal states', async () => {
    query.mockResolvedValue([]);
    await markTrialReady('trial-1', 'trials/trial-1/video.mp4');
    await markTrialFailed('trial-2', 'source unavailable');
    expect(query).toHaveBeenCalledTimes(2);
  });
});
