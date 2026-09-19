import { useEffect, useRef, useState } from 'react';
import { authClient } from '../auth/auth-client';

const intentKey = 'streamnest-checkout-intent';

export default function CheckoutButton({
  offer,
  enabled = false,
  mode = 'test',
}: {
  offer: string;
  enabled?: boolean;
  mode?: 'test' | 'live';
}) {
  const { data: session, isPending } = authClient.useSession();
  // Other islands may resolve the shared session before this island hydrates.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = useRef<{ offer: string; userId: string; id: string } | null>(
    null,
  );
  const inFlight = useRef(false);
  useEffect(() => {
    if (!ready || isPending || !session?.user) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('checkout') !== 'resume' || url.searchParams.get('offer') !== offer) return;
    // A URL alone cannot initiate checkout; require this tab's recent explicit purchase intent.
    let pending;
    try {
      pending = JSON.parse(sessionStorage.getItem(intentKey) ?? 'null');
      if (pending?.offer !== offer) return;
      sessionStorage.removeItem(intentKey);
    } catch { return; }
    url.searchParams.delete('checkout');
    url.searchParams.delete('offer');
    window.history.replaceState(window.history.state, '', url);
    if (typeof pending.createdAt !== 'number' || Date.now() - pending.createdAt > 30 * 60 * 1000 || pending.createdAt > Date.now() ||
      typeof pending.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(pending.id)) return;
    if (!enabled) { setError('Purchases are not available for this account yet.'); return; }
    key.current = { offer, userId: session.user.id, id: pending.id };
    void checkout();
  }, [ready, isPending, session?.user?.id, enabled, offer]);
  async function checkout() {
    if (inFlight.current || !enabled) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      if (!session?.user) {
        sessionStorage.setItem(intentKey, JSON.stringify({ offer, id: crypto.randomUUID(), createdAt: Date.now() }));
        const callback = new URL('/pricing', window.location.origin);
        callback.searchParams.set('checkout', 'resume');
        callback.searchParams.set('offer', offer);
        const result = await authClient.signIn.social({
          provider: 'google',
          callbackURL: callback.href,
        });
        if (result.error) {
          sessionStorage.removeItem(intentKey);
          throw new Error('Unable to start Google sign-in.');
        }
        return;
      }
      if (
        key.current?.offer !== offer ||
        key.current?.userId !== session.user.id
      )
        key.current = {
          offer,
          userId: session.user.id,
          id: crypto.randomUUID(),
        };
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer, requestId: key.current.id }),
        signal: AbortSignal.timeout(20000),
      });
      const result = (await response.json()) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !result.url)
        throw new Error(result.error ?? 'Unable to open checkout.');
      window.location.assign(result.url);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Please retry checkout.',
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="plan-bottom">
      <button
        className="button button-primary"
        type="button"
        disabled={!enabled || busy || !ready || (enabled && isPending)}
        onClick={() => void checkout()}
      >
        {!enabled
          ? 'Purchases not open yet'
          : busy
            ? 'Opening checkout…'
            : mode === 'live'
              ? offer === 'pro-monthly-500' ? 'Subscribe to Pro' : 'Buy this credit pack'
            : ready && session?.user
              ? offer === 'pro-monthly-500'
                ? 'Test Pro subscription'
                : 'Test this credit pack'
              : 'Sign in to test checkout'}
      </button>
      {error && (
        <p role="alert">
          {error} <a href="/account/credits">Manage your subscription</a>
        </p>
      )}
    </div>
  );
}
