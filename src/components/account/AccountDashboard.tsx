import { useEffect, useState } from 'react';
import { authClient } from '../auth/auth-client';

type AccountPayload = {
  account: {
    email: string;
    planId: 'free' | 'pro';
    status: string;
    freeCredits: number;
    paidCredits: number;
  };
  usage: Array<{ toolId: string; status: string; credits: number; durationMs: number }>;
  canGrantTestCredits: boolean;
};

export default function AccountDashboard() {
  const { data: session, isPending } = authClient.useSession();
  const [payload, setPayload] = useState<AccountPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [granting, setGranting] = useState(false);
  const [grantMessage, setGrantMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user) return;
    const controller = new AbortController();
    fetch('/api/me', { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as AccountPayload & { error?: string };
        if (!response.ok) throw new Error(body.error ?? 'Unable to load your account.');
        setPayload(body);
      })
      .catch((reason) => {
        if (reason?.name !== 'AbortError') setError(reason instanceof Error ? reason.message : 'Unable to load your account.');
      });
    return () => controller.abort();
  }, [session?.user]);

  async function signIn() {
    await authClient.signIn.social({ provider: 'google', callbackURL: window.location.href });
  }

  async function grantTestCredit() {
    setGranting(true);
    setGrantMessage(null);
    try {
      const response = await fetch('/api/admin/test-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
      });
      const body = await response.json() as { freeCredits?: number; paidCredits?: number; error?: string };
      if (!response.ok || body.freeCredits === undefined || body.paidCredits === undefined) {
        throw new Error(body.error ?? 'Unable to add a test credit.');
      }
      setPayload((current) => current ? { ...current, account: { ...current.account, freeCredits: body.freeCredits!, paidCredits: body.paidCredits! } } : current);
      setGrantMessage('One test credit was added.');
    } catch (reason) {
      setGrantMessage(reason instanceof Error ? reason.message : 'Unable to add a test credit.');
    } finally {
      setGranting(false);
    }
  }

  if (isPending) return <p className="account-status">Loading your account…</p>;
  if (!session?.user) return <div className="account-empty"><p>Sign in to see your plan, AI credits, and recent tool activity.</p><button className="button button-primary" type="button" onClick={signIn}>Sign in with Google</button></div>;
  if (error) return <p className="error-message" role="alert">{error}</p>;
  if (!payload) return <p className="account-status">Loading your plan and credits…</p>;

  const balance = payload.account.freeCredits + payload.account.paidCredits;
  return (
    <div className="account-dashboard">
      <section className="account-summary">
        <div><span className="eyebrow">Current plan</span><strong>{payload.account.planId === 'pro' ? 'Pro' : 'Free'}</strong><small>{payload.account.email}</small></div>
        <div><span className="eyebrow">AI credits</span><strong>{balance}</strong><small>{payload.account.freeCredits} free · {payload.account.paidCredits} paid</small></div>
      </section>
      {payload.canGrantTestCredits ? <section className="account-admin" aria-labelledby="test-credit-heading">
        <div><span className="eyebrow">Administrator</span><h2 id="test-credit-heading">Test credits</h2><p>Add one free credit to this signed-in test account.</p></div>
        <button className="button button-primary" type="button" disabled={granting} onClick={grantTestCredit}>{granting ? 'Adding…' : 'Add 1 test credit'}</button>
        {grantMessage ? <p role="status" aria-live="polite">{grantMessage}</p> : null}
      </section> : null}
      <section className="account-usage" aria-labelledby="usage-heading">
        <h2 id="usage-heading">Recent AI activity</h2>
        {payload.usage.length === 0 ? <p>No AI tool activity yet.</p> : <ul>{payload.usage.map((item, index) => <li key={`${item.toolId}-${index}`}><strong>{item.toolId.replaceAll('-', ' ')}</strong><span>{item.status}</span><small>{item.credits} credit</small></li>)}</ul>}
      </section>
    </div>
  );
}
