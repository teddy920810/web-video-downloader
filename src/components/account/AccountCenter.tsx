import { useEffect, useState } from 'react';
import { authClient } from '../auth/auth-client';
import type { AccountSettings } from '../../lib/account/settings';
import { accountRequest } from './account-request';
import { accountSections, dateLabel, type AccountPayload, type AccountSection } from './account-types';
import RewardCodes from './RewardCodes';
import BillingPanel from './BillingPanel';

export default function AccountCenter({ section, settings }: { section: AccountSection; settings: AccountSettings }) {
  const { data: session, isPending } = authClient.useSession();
  const [payload, setPayload] = useState<AccountPayload | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [nickname, setNickname] = useState('');
  const [marketing, setMarketing] = useState(false);
  const [grantKey, setGrantKey] = useState('');
  const [navigationOpen, setNavigationOpen] = useState(false);

  useEffect(() => {
    if (!session?.user.id) return;
    const controller = new AbortController();
    accountRequest<AccountPayload>('overview', undefined, controller.signal).then((data) => {
      setPayload(data); setNickname(data.preferences.nickname); setMarketing(data.preferences.marketingOptIn); setError('');
    }).catch(() => { if (!controller.signal.aborted) setError('Unable to load your account. Please retry.'); });
    return () => controller.abort();
  }, [session?.user.id, refresh]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  async function saveProfile() {
    await accountRequest('profile', { nickname, marketingOptIn: marketing });
    setMessage('Your preferences have been saved.');
  }
  function cookieSettings() { document.querySelector<HTMLButtonElement>('[data-cookie-settings]')?.click(); }
  const contact = settings.supportEmail ? `mailto:${settings.supportEmail}` : null;

  if (isPending) return <p className="account-status" role="status">Loading your account…</p>;
  if (!session?.user) return <div className="account-empty"><p>Sign in to manage your profile, credits, and privacy settings.</p><button className="button button-primary" type="button" onClick={() => void run(async () => { const result = await authClient.signIn.social({ provider: 'google', callbackURL: window.location.href }); if (result.error) throw new Error('Unable to start Google sign-in.'); })} disabled={busy}>Sign in with Google</button>{error && <p role="alert">{error}</p>}</div>;

  return <div className="account-center">
    <aside className={`account-nav${navigationOpen ? ' is-expanded' : ''}`} onKeyDown={(event) => { if (event.key === 'Escape') setNavigationOpen(false); }}><span className="eyebrow account-nav-label">Your account</span><button className="account-nav-toggle" type="button" aria-expanded={navigationOpen} aria-controls="account-navigation" onClick={() => setNavigationOpen(!navigationOpen)}>Your account</button><nav id="account-navigation" aria-label="Account navigation">{accountSections.map((item) => <a key={item.id} href={item.href} aria-current={section === item.id ? 'page' : undefined}>{item.label}</a>)}</nav></aside>
    <div className="account-content">
      {error && <div className="account-panel" role="alert">{error} <button type="button" onClick={() => { setError(''); setRefresh((value) => value + 1); }}>Reload account</button></div>}
      {message && <p className="account-notice" role="status">{message}</p>}
      {!payload || payload.account.userId !== session.user.id ? (!error && <p role="status">Loading your plan and credits…</p>) : <>
        {(section === 'overview' || section === 'credits') && <>
          <section className="account-metrics" aria-label="Account summary">
            <div className="account-panel"><span>Current plan</span><strong>{payload.account.planId === 'pro' ? 'Pro' : 'Free'}</strong><small>Status: {payload.account.status}</small></div>
            <div className="account-panel"><span>Available AI credits</span><strong>{payload.account.freeCredits + payload.account.paidCredits}</strong><small>{payload.account.freeCredits} free / promotional · {payload.account.paidCredits} paid</small></div>
            <div className="account-panel"><span>Reserved AI credits</span><strong>{payload.reservedCredits}</strong><small>Held for processing jobs</small></div>
          </section>
          {section === 'overview' && <section className="account-panel"><h2>Recent AI activity</h2>{payload.usage.length ? <ul className="account-list">{payload.usage.map((item, index) => <li key={index}><span>{item.toolId.replaceAll('-', ' ')}</span><span>{item.status === 'failed' ? 'Failed · credits refunded' : `Succeeded · ${item.credits} credit used`}</span></li>)}</ul> : <p>No AI tool activity yet.</p>}<div className="account-actions"><a className="button button-primary" href="/background-remover">Background Remover</a><a href="/video-converter">Video Converter</a></div></section>}
          {section === 'credits' && <>
            <BillingPanel supportEmail={settings.supportEmail} reloadAccount={() => setRefresh(value => value + 1)} />
            <section className="account-panel"><h2>Credit history</h2><p>Latest 50 ledger entries. Reservations reduce the available balance; consumption confirms a reservation without charging again. Welcome balance may predate the ledger.</p>{payload.ledger.length ? <div className="account-table-scroll"><table><thead><tr><th>Date</th><th>Event</th><th>Free / promotional</th><th>Paid</th></tr></thead><tbody>{payload.ledger.map((item) => <tr key={item.id}><td>{dateLabel(item.createdAt)}</td><td>{item.eventType}</td><td>{item.freeDelta > 0 ? '+' : ''}{item.freeDelta}</td><td>{item.paidDelta > 0 ? '+' : ''}{item.paidDelta}</td></tr>)}</tbody></table></div> : <p>No credit transactions yet.</p>}</section>
          </>}
        </>}
        {section === 'profile' && <section className="account-panel"><h2>Personal information</h2><div className="account-identity">{payload.account.image && <img src={payload.account.image} alt="Google profile" width="64" height="64" referrerPolicy="no-referrer" />}<div><strong>{payload.account.name || 'Google account'}</strong><p>{payload.account.email}</p><small>Name, avatar, and email are managed by Google.</small></div></div><form onSubmit={(event) => { event.preventDefault(); void run(saveProfile); }}><label>Nickname<input name="nickname" maxLength={80} value={nickname} onChange={(event) => setNickname(event.target.value)} autoComplete="nickname" /></label><label className="account-checkbox"><input type="checkbox" checked={marketing} onChange={(event) => setMarketing(event.target.checked)} />Email me product news and offers (optional).</label><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button></form></section>}
        {section === 'redeem' && <RewardCodes payload={payload} reload={() => setRefresh((value) => value + 1)} />}
        {section === 'security' && <>
          <section className="account-panel"><h2>Sign-in & security</h2><p>Signed in with Google: {payload.account.email}</p><p>Streamnest does not use a separate account password.</p><div className="account-actions"><a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer">Manage Google security</a><button type="button" className="button button-secondary" disabled={busy} onClick={() => void run(async () => { const result = await authClient.signOut(); if (result.error) throw new Error('Unable to sign out.'); window.location.assign('/account'); })}>Sign out of this browser</button></div></section>
          <section className="account-panel"><h2>Privacy preferences</h2><button className="button button-secondary" type="button" onClick={cookieSettings}>Cookie settings</button><form onSubmit={(event) => { event.preventDefault(); void run(saveProfile); }}><label className="account-checkbox"><input type="checkbox" checked={marketing} onChange={(event) => setMarketing(event.target.checked)} />Email me product news and offers (optional).</label><button className="button button-primary" disabled={busy}>Save privacy preferences</button></form><p>Browser-local files stay on your device. Cloud AI jobs are processed remotely; see the Privacy Policy for details.</p>{contact ? <a href={`${contact}?subject=Account%20privacy%20request`}>Request account data or deletion</a> : <p>A monitored data-request contact has not been configured yet.</p>}<p><a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms & Conditions</a> · <a href="/refund-policy">Refund Policy</a></p></section>
        </>}
        {section === 'help' && <>
          <section className="account-panel"><h2>Help & Support</h2>{contact ? <><p>Include the tool name, approximate time, and any error message. Never send passwords, payment details, or private files.</p><a className="button button-primary" href={`${contact}?subject=Streamnest%20support`}>Contact support</a></> : <p>Direct support is not configured yet. You can find answers below.</p>}</section>
          {(['Account', 'Tools', 'Credits', 'Subscription'] as const).map((category) => <section className="account-panel" key={category}><h2>{category} FAQ</h2>{settings.faq.filter((item) => item.category === category).map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</section>)}
          <section className="account-panel"><h2>Policies</h2><div className="account-actions"><a href="/privacy">Privacy Policy</a><a href="/terms">Terms & Conditions</a><a href="/refund-policy">Refund Policy</a></div></section>
        </>}
        {payload.canGrantTestCredits && section === 'credits' && <section className="account-panel"><h2>Administrator · Test credits</h2><p>Add one test credit to your own account. This does not call an AI provider.</p><button className="button button-primary" type="button" disabled={busy} onClick={() => void run(async () => {
          const key = grantKey || crypto.randomUUID(); setGrantKey(key);
          const response = await fetch('/api/admin/test-credits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey: key }), signal: AbortSignal.timeout(15000) });
          if (!response.ok) throw new Error('Unable to add a test credit. Retry will use the same request.');
          setGrantKey(''); setMessage('One test credit was added.'); setRefresh((value) => value + 1);
        })}>Add 1 test credit</button></section>}
      </>}
    </div>
  </div>;
}
