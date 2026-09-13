import { useEffect, useState } from 'react';
import { CREDIT_PACKS, creditCount, usd } from '../../lib/product/pricing';

export default function CreditPackSelector({ supportEmail }: { supportEmail: string }) {
  const [selected, setSelected] = useState<number>(300);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const pack = CREDIT_PACKS.find((item) => item.credits === selected)!;
  return <article className="plan-card plan-packs">
    <p className="eyebrow">For occasional use</p><h2>Credit Packs</h2>
    <p className="plan-description">Buy once. Use when you need them, without a subscription.</p>
    <div className="plan-price" aria-live="polite">{usd(pack.priceCents)}<span>one time</span></div>
    <p className="plan-note">Valid for 24 months from purchase</p>
    <div className="plan-allowance"><div><span className="eyebrow">Your credit pack</span><strong aria-live="polite">{creditCount(pack.credits)} <small>credits</small></strong></div><span>$0.015<br /><small>per credit</small></span></div>
    <fieldset><legend>Choose your pack</legend><div className="pack-choices">
      {CREDIT_PACKS.map((item) => <label key={item.credits} className={item.credits === selected ? 'selected' : ''}>
        <input type="radio" name="credit-pack" value={item.credits} checked={item.credits === selected} disabled={!ready} onChange={() => setSelected(item.credits)} />
        <span><b>{creditCount(item.credits)} credits</b><small>{usd(item.priceCents)}</small></span>
      </label>)}
    </div></fieldset>
    <p className="plan-detail">No recurring charge. Buying a pack does not start a Pro subscription.</p>
    <button className="button button-primary plan-bottom" type="button" disabled>Purchases not open yet</button>
    {supportEmail && <a className="plan-contact" href={`mailto:${supportEmail}?subject=Streamnest%20custom%20credit%20pack`}>Need more than 10,000 credits? Contact us</a>}
  </article>;
}
