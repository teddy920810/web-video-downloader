import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import './account-menu.css';

const entries = [
  { label: 'Account Center', href: '/account', icon: 'M20 21v-2a7 7 0 0 0-14 0v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8' },
  { label: 'Personal Information', href: '/account/profile', icon: 'M4 4h16v16H4z M8 9h8 M8 13h5 M8 17h8' },
  { label: 'Subscription & Credits', href: '/account/credits', icon: 'M3 5h18v14H3z M3 9h18 M7 15h4' },
  { label: 'Redeem Code', href: '/account/redeem', icon: 'M3 8h18v4H3z M5 12v9h14v-9 M12 8v13 M12 8C6 8 6 2 9 3c3 0 3 5 3 5s0-5 3-5c3-1 3 5-3 5' },
  { label: 'Security & Privacy', href: '/account/security', icon: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6' },
  { label: 'Help & Support', href: '/account/help', icon: 'M4 13v-2a8 8 0 0 1 16 0v2 M4 11H2v7h4v-7z M20 11h2v7h-4v-7z M20 18c0 3-4 3-7 3' },
];
function Icon({ path }: { path: string }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>;
}

type Props = {
  user: { name?: string | null; email?: string; image?: string | null };
  pending: boolean;
  error: string;
  onSignOut: () => Promise<void>;
};
export default function AccountMenu({ user, pending, error, onSignOut }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const displayName = user.name || user.email || 'Your account';
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  function keys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && open) {
      event.preventDefault(); setOpen(false); trigger.current?.focus(); return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    if (!open) {
      if (event.key.startsWith('Arrow')) { event.preventDefault(); setOpen(true); }
      return;
    }
    event.preventDefault();
    const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }
  return <div className="header-account-menu" ref={root} onKeyDown={keys}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <button className="header-account" type="button" ref={trigger} aria-label="Account menu" aria-haspopup="menu"
      aria-expanded={open} aria-controls="header-account-panel" onClick={() => setOpen(value => !value)}>
      {user.image ? <img src={user.image} alt="" referrerPolicy="no-referrer" /> : <span className="header-avatar-fallback" aria-hidden="true">{displayName.slice(0, 1).toUpperCase()}</span>}
      <span className="header-account-name">{displayName}</span>
      <svg className="header-account-chevron" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" /></svg>
    </button>
    {open && <div className="header-account-panel" id="header-account-panel" role="menu" aria-label="Your account" ref={panel}>
      <div className="header-account-details" role="presentation"><strong>{displayName}</strong>{user.email && <small>{user.email}</small>}</div>
      {entries.map(item => <a role="menuitem" key={item.href} href={item.href}><Icon path={item.icon} /><span>{item.label}</span></a>)}
      <div className="header-account-divider" role="separator" />
      <button role="menuitem" type="button" disabled={pending} onClick={() => void onSignOut()}><Icon path="M9 4H4v16h5 M14 8l4 4-4 4 M8 12h13" /><span>{pending ? 'Signing out…' : 'Sign out'}</span></button>
      {error && <p className="header-account-error" role="alert">{error}</p>}
    </div>}
  </div>;
}
