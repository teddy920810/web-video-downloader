import { useEffect, useState } from 'react';
import { accountRequest } from './account-request';
import { dateLabel, type AccountPayload, type CodeList } from './account-types';

const outcomes: Record<string, string> = {
  redeemed: 'Credits added to your account.', already_redeemed: 'You have already redeemed this code. No additional credits were added.',
  invalid: 'This code is not valid.', expired: 'This code has expired.', disabled: 'This code is no longer active.',
  exhausted: 'This code has reached its redemption limit.', unavailable: 'Your wallet is not available. Please reload your account.',
};

export default function RewardCodes({ payload, reload }: { payload: AccountPayload; reload: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [admin, setAdmin] = useState<CodeList | null>(null);
  const [created, setCreated] = useState('');
  const [requestId, setRequestId] = useState('');
  const [adminRefresh, setAdminRefresh] = useState(0);
  useEffect(() => {
    if (!payload.canGrantTestCredits) return;
    const controller = new AbortController();
    accountRequest<CodeList>('codes', undefined, controller.signal).then(setAdmin).catch(() => { if (!controller.signal.aborted) setMessage('Unable to load administrator codes. Reload this page to retry.'); });
    return () => controller.abort();
  }, [payload.canGrantTestCredits, adminRefresh]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage('');
    try { await action(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  return <>
    <section className="account-panel"><h2>Redeem Reward Code</h2><p>Reward codes add promotional AI credits. Each account can redeem a code once.</p><form onSubmit={(event) => { event.preventDefault(); void run(async () => {
      const result = await accountRequest<{ outcome: string; awarded: number }>('redeem', { code });
      setMessage(outcomes[result.outcome] ?? 'Unable to redeem this code.');
      if (['redeemed', 'already_redeemed'].includes(result.outcome)) reload();
    }); }}><label>Reward code<input name="rewardCode" value={code} onChange={(event) => setCode(event.target.value)} maxLength={64} required autoComplete="off" spellCheck={false} /></label><div className="account-actions"><button className="button button-primary" disabled={busy}>{busy ? 'Please wait…' : 'Redeem code'}</button><button type="button" className="button button-secondary" disabled={busy} onClick={reload}>Refresh balance & history</button></div></form></section>
    {message && <p role="status" className="account-notice">{message}</p>}
    <section className="account-panel"><h2>Your redemptions</h2>{payload.redemptions.length ? <ul className="account-list">{payload.redemptions.map((item) => <li key={item.id}><span>{item.label} · +{item.credits} credits</span><time>{dateLabel(item.createdAt)}</time></li>)}</ul> : <p>No reward codes redeemed yet.</p>}</section>
    {payload.canGrantTestCredits && <section className="account-panel"><h2>Administrator · Reward codes</h2><p>The code is shown only once. Save it securely before leaving this page.</p><form onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      void run(async () => {
        const key = requestId || crypto.randomUUID(); setRequestId(key);
        const result = await accountRequest<{ code: string | null }>('codes', { label: data.get('label'), credits: Number(data.get('credits')), maxUses: Number(data.get('maxUses')), expiresAt: new Date(String(data.get('expiresAt'))).toISOString(), requestId: key });
        setRequestId(''); setCreated(result.code ?? 'This request already created a code. If it was not saved, disable it and create another.'); setAdminRefresh((value) => value + 1);
      });
    }}><label>Internal label<input name="label" maxLength={80} required /></label><div className="account-form-grid"><label>Credits<input name="credits" type="number" defaultValue={1} min={1} max={1000} required /></label><label>Maximum redemptions<input name="maxUses" type="number" defaultValue={1} min={1} max={10000} required /></label><label>Expires at (your local time)<input name="expiresAt" type="datetime-local" required /></label></div><button className="button button-primary" disabled={busy}>Create reward code</button></form>
      {created && <div className="account-notice"><label>New reward code<input value={created} readOnly autoComplete="off" /></label></div>}
      {admin && <><h3>Latest 100 codes</h3><ul className="account-list">{admin.codes.map((item) => <li key={item.id}><span>{item.label} · {item.credits} credits · {item.usedCount}/{item.maxUses} uses<br /><small>Expires {dateLabel(item.expiresAt)}</small></span><button type="button" disabled={busy || item.disabled} onClick={() => void run(async () => { await accountRequest('disable-code', { id: item.id }); setAdminRefresh((value) => value + 1); })}>{item.disabled ? 'Disabled' : 'Disable'}</button></li>)}</ul><h3>Recent redemptions</h3><ul className="account-list">{admin.redemptions.map((item, index) => <li key={index}><span>{item.label} · {item.credits} credits<br /><small>Account ID: {item.userId}</small></span><time>{dateLabel(item.createdAt)}</time></li>)}</ul></>}
    </section>}
  </>;
}
