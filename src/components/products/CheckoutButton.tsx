import { useEffect, useRef, useState } from 'react';
import { authClient } from '../auth/auth-client';

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
  async function checkout() {
    if (busy || !enabled) return;
    setBusy(true);
    setError('');
    try {
      if (!session?.user) {
        const result = await authClient.signIn.social({
          provider: 'google',
          callbackURL: window.location.href,
        });
        if (result.error) throw new Error('Unable to start Google sign-in.');
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
            : ready && session?.user
              ? offer === 'pro-monthly-500'
                ? mode === 'live' ? 'Subscribe to Pro' : 'Test Pro subscription'
                : mode === 'live' ? 'Buy this credit pack' : 'Test this credit pack'
              : mode === 'live' ? 'Sign in to purchase' : 'Sign in to test checkout'}
      </button>
      {error && (
        <p role="alert">
          {error} <a href="/account/credits">Manage your subscription</a>
        </p>
      )}
    </div>
  );
}
