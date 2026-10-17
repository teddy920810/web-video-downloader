import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  googleSession: vi.fn(), enabled: vi.fn(), emailToken: vi.fn(), emailSession: vi.fn(),
  link: vi.fn(), canonical: vi.fn(),
}));
vi.mock('astro:env/server', () => ({ getSecret: () => undefined }));
vi.mock('better-auth', () => ({ betterAuth: () => ({ api: { getSession: mocks.googleSession } }) }));
vi.mock('./account-auth/runtime', () => ({
  sharedAuthEnabled: mocks.enabled, emailToken: mocks.emailToken,
  accountAuth: () => ({ session: mocks.emailSession, link: mocks.link, canonical: mocks.canonical }),
}));

describe('shared account resolution for ordinary Google Web sessions', () => {
  const request = new Request('https://www.example.test/api/me');
  const google = {
    user: { id: 'new-google-session-id', email: 'one@example.test', emailVerified: true, name: 'One', image: null },
    session: { id: 'session-id', userId: 'new-google-session-id' },
  };
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.enabled.mockReturnValue(true);
    mocks.emailToken.mockReturnValue('');
    mocks.googleSession.mockResolvedValue(google);
    mocks.link.mockResolvedValue('existing-pro-account');
    mocks.canonical.mockResolvedValue(null);
  });
  afterEach(() => vi.resetAllMocks());

  it('links a verified Google login before account creation, even without a pre-existing mapping', async () => {
    const { getSession } = await import('./auth');
    const session = await getSession(request);
    expect(mocks.link).toHaveBeenCalledWith(google.user);
    expect(session?.user.id).toBe('existing-pro-account');
    expect(session?.session.userId).toBe('existing-pro-account');
    expect(session?.user.email).toBe(google.user.email);
    expect(mocks.canonical).not.toHaveBeenCalled();
  });
  it('never falls back to creating a free wallet when an identity needs review', async () => {
    mocks.link.mockRejectedValue(new Error('account_link_review_required'));
    const { getSession } = await import('./auth');
    await expect(getSession(request)).rejects.toThrow('account_link_review_required');
  });
  it('preserves a valid email session and does not link an unverified Google email', async () => {
    const { getSession } = await import('./auth');
    mocks.emailToken.mockReturnValue('email-token');
    mocks.emailSession.mockResolvedValue({ ...google, user: { ...google.user, id: 'email-canonical' } });
    expect((await getSession(request))?.user.id).toBe('email-canonical');
    expect(mocks.link).not.toHaveBeenCalled();
    mocks.emailToken.mockReturnValue('');
    mocks.googleSession.mockResolvedValue({ ...google, user: { ...google.user, emailVerified: false } });
    expect((await getSession(request))?.user.id).toBe(google.user.id);
    expect(mocks.link).not.toHaveBeenCalled();
  });
  it('leaves the existing Google path unchanged when shared identity is disabled', async () => {
    mocks.enabled.mockReturnValue(false);
    const { getSession } = await import('./auth');
    expect(await getSession(request)).toEqual(google);
    expect(mocks.link).not.toHaveBeenCalled();
  });
});
