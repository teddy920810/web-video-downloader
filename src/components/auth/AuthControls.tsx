import { useState } from 'react';
import { authClient } from './auth-client';
import AccountMenu from './AccountMenu';

export default function AuthControls() {
  const { data: session, isPending } = authClient.useSession();
  const [actionPending, setActionPending] = useState(false);
  const [error, setError] = useState('');

  async function signIn() {
    setActionPending(true);
    try {
      await authClient.signIn.social({ provider: 'google', callbackURL: window.location.href });
    } finally {
      setActionPending(false);
    }
  }

  async function signOut() {
    setError('');
    setActionPending(true);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error('Unable to sign out. Please try again.');
      window.location.reload();
    } catch {
      setError('Unable to sign out. Please try again.');
    } finally {
      setActionPending(false);
    }
  }

  if (isPending) {
    return <span className="header-auth-loading" role="status"><span className="sr-only">Loading account</span></span>;
  }

  if (session?.user) {
    return <AccountMenu user={session.user} onSignOut={signOut} pending={actionPending} error={error} />;
  }

  return (
    <button className="header-cta" type="button" onClick={signIn} disabled={actionPending}>
      {actionPending ? 'Connecting…' : 'Sign in with Google'}
    </button>
  );
}
