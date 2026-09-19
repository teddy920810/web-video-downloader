import { useEffect, useState } from 'react';
import { dateLabel } from './account-types';
type BillingSummary = {
  enabled: boolean;
  mode?: 'test' | 'live';
  batches?: Array<{
    id: string;
    kind: string;
    remaining: number;
    consumed: number;
    expiresAt: string | null;
    revokedAt: string | null;
    refundEligible: boolean;
  }>;
  subscriptions?: Array<{ id: string; status: string; periodEnd: string }>;
};

export default function BillingPanel({
  supportEmail,
  reloadAccount,
}: {
  supportEmail: string;
  reloadAccount: () => void;
}) {
  const [data, setData] = useState<BillingSummary | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/billing/status', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load billing.');
        setData((await response.json()) as BillingSummary);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('Unable to load billing. Please refresh.');
      });
    return () => controller.abort();
  }, [refresh]);
  async function action(path: 'cancel' | 'portal', subscriptionId?: string) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/billing/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscriptionId ? { subscriptionId } : {}),
        signal: AbortSignal.timeout(20000),
      });
      const result = (await response.json()) as {
        url?: string;
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error ?? 'Unable to update billing.');
      if (result.url) window.location.assign(result.url);
      else {
        setNotice(
          'Renewal canceled. Your current credits remain valid until their expiration date.',
        );
        setRefresh((v) => v + 1);
        reloadAccount();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="account-panel">
      <h2>Your subscription</h2>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!data ? (
        <p>Loading billing…</p>
      ) : !data.enabled ? (
        <p>
          Purchases are not open yet. No action here starts a subscription or
          charges a card.
        </p>
      ) : (
        <>
          {data.mode === 'test' && <p className="account-notice">
            Test mode · No real charges. Test credits stay in this test account.
          </p>}
          <p>
            After checkout, credits appear when payment is confirmed. Returning
            here alone does not confirm payment.
          </p>
          <button
            type="button"
            className="button button-secondary"
            disabled={busy}
            onClick={() => {
              setError('');
              setRefresh((v) => v + 1);
              reloadAccount();
            }}
          >
            Refresh payment status
          </button>
          {data.subscriptions?.map((sub) => (
            <div key={sub.id}>
              <p>
                <strong>Pro</strong> · {sub.status.replaceAll('_', ' ')} ·
                Period ends {dateLabel(sub.periodEnd)}
              </p>
              {!['canceled', 'expired', 'scheduled_cancel'].includes(
                sub.status,
              ) && (
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => void action('cancel', sub.id)}
                >
                  Cancel renewal
                </button>
              )}
            </div>
          ))}
          {!!data.subscriptions?.length && (
            <button
              type="button"
              className="button button-secondary"
              disabled={busy}
              onClick={() => void action('portal')}
            >
              Manage billing and invoices
            </button>
          )}
          <h3>Paid credit batches</h3>
          <p>
            Free / promotional credits are used first, followed by the paid
            credits that expire soonest.
          </p>
          {!data.batches?.length ? (
            <p>No confirmed purchases yet.</p>
          ) : (
            <ul className="account-list">
              {data.batches.map((batch) => (
                <li key={batch.id}>
                  <div>
                    <strong>
                      {batch.kind === 'pro'
                        ? 'Pro monthly credits'
                        : 'Credit pack'}{' '}
                      · {batch.remaining} available
                    </strong>
                    <p>
                      {batch.revokedAt
                        ? 'Revoked after refund or dispute'
                        : batch.expiresAt
                          ? `Expires ${dateLabel(batch.expiresAt)}`
                          : 'No expiration date'}
                    </p>
                    {batch.refundEligible && supportEmail && (
                      <a
                        href={`mailto:${supportEmail}?subject=${encodeURIComponent(`Streamnest refund request · ${batch.id}`)}`}
                      >
                        Request refund for this purchase
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <p>
        Pro is $4.99/month for 500 credits, valid until the end of each paid
        billing period without rollover. One-time credit packs start at $4.50
        for 300 credits and remain valid for 24 months.
      </p>
      <p>
        Local browser tools remain free. Promotional codes do not activate Pro.
      </p>
      <a className="button button-primary" href="/pricing">
        View plans
      </a>
      <p>
        <a href="/refund-policy">Refund and cancellation rules</a>
      </p>
    </section>
  );
}
