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
};

export default function AccountDashboard() {
  const { data: session, isPending } = authClient.useSession();
  const [payload, setPayload] = useState<AccountPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <section className="account-usage" aria-labelledby="usage-heading">
        <h2 id="usage-heading">Recent AI activity</h2>
        {payload.usage.length === 0 ? <p>No AI tool activity yet.</p> : <ul>{payload.usage.map((item, index) => <li key={`${item.toolId}-${index}`}><strong>{item.toolId.replaceAll('-', ' ')}</strong><span>{item.status}</span><small>{item.credits} credit</small></li>)}</ul>}
      </section>
    </div>
  );
}
