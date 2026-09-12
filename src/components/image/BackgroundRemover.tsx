import { useEffect, useRef, useState } from 'react';
import { DownloadSimpleIcon } from '@phosphor-icons/react/DownloadSimple';
import { ImageIcon } from '@phosphor-icons/react/Image';
import { ShieldCheckIcon } from '@phosphor-icons/react/ShieldCheck';
import { TrashIcon } from '@phosphor-icons/react/Trash';
import { UploadSimpleIcon } from '@phosphor-icons/react/UploadSimple';
import { authClient } from '../auth/auth-client';
import { putFileWithRetry } from '../../lib/upload/direct-upload';
import { validateUploadMetadata } from '../../lib/upload/validation';
import type { BackgroundRemoverCopy } from '../../lib/content/utilities-settings';
import { trackToolEvent } from '../../lib/analytics/tool-events';
import ProcessingOverlay from '../shared/ProcessingOverlay';
import { downloadBackgroundResult } from '../../lib/image/background-export';
import BatchWorkspace from '../shared/BatchWorkspace';
import ColorSwatches from '../shared/ColorSwatches';

type Phase = 'idle' | 'selected' | 'uploading' | 'processing' | 'exporting' | 'ready' | 'error';
type ApiError = { error?: string };

async function readApi<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(180_000) });
  const body = await response.json() as T & ApiError;
  if (!response.ok) throw new Error(body.error ?? 'Unable to complete this request.');
  return body;
}

export default function BackgroundRemover({ copy }: { copy: BackgroundRemoverCopy }) {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [background, setBackground] = useState('transparent');
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [batch, setBatch] = useState<File[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);
  useEffect(() => {
    if (!session?.user) { setCreditBalance(null); return; }
    const controller = new AbortController();
    fetch('/api/me', { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() : null)
      .then((body) => {
        if (body?.account) setCreditBalance(Number(body.account.freeCredits) + Number(body.account.paidCredits));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [session?.user]);

  function choose(next: File) {
    const validation = validateUploadMetadata({ contentType: next.type, size: next.size });
    if (!validation.ok) {
      setMessage(validation.message);
      setPhase('error');
      return;
    }
    setFile(next);
    setPreviewUrl(URL.createObjectURL(next));
    setResultUrl(null);
    setMessage(null);
    setPhase('selected');
  }

  function selectFiles(files: File[]) {
    if (busy || !files.length) return;
    if (files.length > 1) {
      setFile(null); setPreviewUrl(null); setResultUrl(null); setMessage(null); setPhase('idle');
      setBatch(files);
      return;
    }
    choose(files[0]);
  }

  function reset() {
    setFile(null);
    setPreviewUrl(null);
    setResultUrl(null);
    setMessage(null);
    setBackground('transparent');
    setPhase('idle');
    if (inputRef.current) inputRef.current.value = '';
  }

  async function processImage() {
    if (!file || sessionPending) return;
    if (!session?.user) {
      await authClient.signIn.social({ provider: 'google', callbackURL: window.location.href });
      return;
    }
    try {
      trackToolEvent('background-remover', 'started', 'cloud');
      setMessage(null);
      setPhase('uploading');
      const upload = await readApi<{ jobId: string; inputKey: string; uploadUrl: string }>('/api/background-remover/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: file.type, size: file.size }),
      });
      const stored = await putFileWithRetry(upload.uploadUrl, file, file.type);
      if (!stored.ok) throw new Error(copy.uploadError);
      setPhase('processing');
      const result = await readApi<{ downloadUrl: string }>('/api/background-remover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: upload.jobId, inputKey: upload.inputKey }),
      });
      setResultUrl(result.downloadUrl);
      setCreditBalance((balance) => balance === null ? null : Math.max(0, balance - 1));
      setPhase('ready');
      trackToolEvent('background-remover', 'succeeded', 'cloud');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.processError);
      setPhase('error');
      trackToolEvent('background-remover', 'failed', 'cloud');
    }
  }

  async function downloadResult() {
    if (!resultUrl) return;
    try {
      setMessage(null);
      setPhase('exporting');
      await downloadBackgroundResult(resultUrl, background);
      setPhase('ready');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.processError);
      setPhase('ready');
    }
  }

  const selected = Boolean(file && previewUrl);
  const busy = phase === 'uploading' || phase === 'processing' || phase === 'exporting';
  const displayUrl = resultUrl ?? previewUrl;

  if (batch) return <section className="background-remover-tool" data-workspace="true">
    {!session?.user ? <button className="button button-primary" disabled={sessionPending} onClick={() => authClient.signIn.social({ provider: 'google', callbackURL: window.location.href })}>Sign in with Google</button> : null}
    <BatchWorkspace toolId="background-remover" initialFiles={batch} accept="image/jpeg,image/png,image/webp" cloud ready={Boolean(session?.user) && !sessionPending} onClose={() => setBatch(null)} background={background} creditBalance={creditBalance}
      beforeStart={async count => {
        const body = await readApi<{ account: { freeCredits: number; paidCredits: number } }>('/api/me', { method: 'GET' });
        const balance = Number(body.account.freeCredits) + Number(body.account.paidCredits);
        setCreditBalance(balance);
        if (!Number.isFinite(balance) || balance < count) throw new Error(`This batch needs ${count} AI credits. Your available balance is ${Number.isFinite(balance) ? balance : 'unavailable'}. Remove waiting files or add credits before starting. No files were processed.`);
      }}
      settings={<ColorSwatches value={background} onChange={setBackground} />}
      process={async files => {
        if (!session?.user) throw new Error('Sign in before starting AI tasks.');
        const next = files[0];
        const check = validateUploadMetadata({ contentType: next.type, size: next.size });
        if (!check.ok) throw new Error(check.message);
        const upload = await readApi<{ jobId: string; inputKey: string; uploadUrl: string }>('/api/background-remover/upload-url', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contentType: next.type, size: next.size }),
        });
        const stored = await putFileWithRetry(upload.uploadUrl, next, next.type, { fetcher: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(60_000) }) });
        if (!stored.ok) throw new Error(copy.uploadError);
        const output = await readApi<{ downloadUrl: string }>('/api/background-remover', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: upload.jobId, inputKey: upload.inputKey }),
        });
        const response = await fetch(output.downloadUrl, { cache: 'no-store', signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw new Error('The AI result is saved in your account, but could not be downloaded here. Check your account before submitting again.');
        const blob = await response.blob();
        setCreditBalance(balance => balance === null ? null : Math.max(0, balance - 1));
        return { blob, rawBlob: blob, name: 'background-removed.png' };
      }} />
  </section>;

  return (
    <section className="background-remover-tool" data-workspace={selected ? 'true' : 'false'} aria-labelledby="background-tool-title" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); selectFiles(Array.from(e.dataTransfer.files)); }}>
      {!selected ? (
        <label className="background-dropzone">
          <ImageIcon size={44} aria-hidden="true" />
          <strong id="background-tool-title">{copy.dropHeading}</strong>
          <span>{copy.dropIntro}</span>
          <span className="button button-primary"><UploadSimpleIcon size={18} />{copy.uploadLabel}</span>
          <small>{copy.formatHelp}</small>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={e => { selectFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
        </label>
      ) : (
        <div className="background-workspace">
          <div className="background-canvas" style={{ backgroundColor: background === 'transparent' ? '#d8dbe5' : background }}>
            {displayUrl ? <img src={displayUrl} crossOrigin={resultUrl ? 'anonymous' : undefined} alt={resultUrl ? copy.resultAlt : copy.previewAlt} /> : null}
            {busy ? <ProcessingOverlay label={phase === 'uploading' ? copy.uploadingLabel : copy.processingLabel} /> : null}
            <button type="button" className="background-reset" disabled={busy} onClick={reset} aria-label={copy.removeLabel}><TrashIcon size={18} /></button>
          </div>
          <aside className="background-controls">
            <div><p>{copy.privateLabel}</p><h2 id="background-tool-title">{resultUrl ? copy.resultHeading : copy.selectedHeading}</h2></div>
            <div className="background-file-meta"><strong>{file?.name}</strong><span>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : ''}</span></div>
            <p className="background-credit-note">1 AI credit per successful result{creditBalance === null ? '' : ` · ${creditBalance} available`}</p>
            {resultUrl ? (
              <ColorSwatches label={copy.backgroundLabel} value={background} onChange={setBackground} disabled={busy} />
            ) : null}
            {message ? <p className="error-message" role="alert">{message}</p> : null}
            <div className="local-media-actions">
              {!resultUrl ? <button className="button button-primary" type="button" disabled={busy} onClick={processImage}>{busy ? copy.workingLabel : copy.removeBackgroundLabel}</button> : null}
              {resultUrl ? <button className="button button-primary" type="button" disabled={busy} onClick={downloadResult}><DownloadSimpleIcon size={18} />{copy.downloadLabel}</button> : null}
              <button className="button button-ghost" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>{copy.chooseAnotherLabel}</button>
            </div>
            <input ref={inputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={e => { selectFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
            <p className="local-media-privacy"><ShieldCheckIcon size={20} />{copy.privacyLabel}</p>
          </aside>
        </div>
      )}
      {!selected && message ? <p className="error-message" role="alert">{message}</p> : null}
    </section>
  );
}
