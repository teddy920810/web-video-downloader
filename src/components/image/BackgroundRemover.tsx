import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { DownloadSimpleIcon } from '@phosphor-icons/react/DownloadSimple';
import { ImageIcon } from '@phosphor-icons/react/Image';
import { ShieldCheckIcon } from '@phosphor-icons/react/ShieldCheck';
import { TrashIcon } from '@phosphor-icons/react/Trash';
import { UploadSimpleIcon } from '@phosphor-icons/react/UploadSimple';
import { authClient } from '../auth/auth-client';
import { putFileWithRetry } from '../../lib/upload/direct-upload';
import { validateUploadMetadata } from '../../lib/upload/validation';
import type { BackgroundRemoverCopy } from '../../lib/content/utilities-settings';

type Phase = 'idle' | 'selected' | 'uploading' | 'processing' | 'ready' | 'error';
type ApiError = { error?: string };

async function readApi<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

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

  function onInput(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (selected) choose(selected);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    const selected = event.dataTransfer.files?.[0];
    if (selected) choose(selected);
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
      setPhase('ready');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.processError);
      setPhase('error');
    }
  }

  const selected = Boolean(file && previewUrl);
  const busy = phase === 'uploading' || phase === 'processing';
  const displayUrl = resultUrl ?? previewUrl;
  const swatches = ['transparent', '#ffffff', '#111827', '#f3f4f6', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6'];

  return (
    <section className="background-remover-tool" data-workspace={selected ? 'true' : 'false'} aria-labelledby="background-tool-title">
      {!selected ? (
        <label className="background-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
          <ImageIcon size={44} aria-hidden="true" />
          <strong id="background-tool-title">{copy.dropHeading}</strong>
          <span>{copy.dropIntro}</span>
          <span className="button button-primary"><UploadSimpleIcon size={18} />{copy.uploadLabel}</span>
          <small>{copy.formatHelp}</small>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onInput} />
        </label>
      ) : (
        <div className="background-workspace">
          <div className="background-canvas" style={{ backgroundColor: background === 'transparent' ? '#d8dbe5' : background }}>
            {displayUrl ? <img src={displayUrl} alt={resultUrl ? copy.resultAlt : copy.previewAlt} /> : null}
            <button type="button" className="background-reset" onClick={reset} aria-label={copy.removeLabel}><TrashIcon size={18} /></button>
          </div>
          <aside className="background-controls">
            <div><p>{copy.privateLabel}</p><h2 id="background-tool-title">{resultUrl ? copy.resultHeading : copy.selectedHeading}</h2></div>
            <div className="background-file-meta"><strong>{file?.name}</strong><span>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : ''}</span></div>
            {resultUrl ? (
              <fieldset className="background-swatches"><legend>{copy.backgroundLabel}</legend>{swatches.map((color) => (
                <button key={color} type="button" className={background === color ? 'is-selected' : ''} style={{ backgroundColor: color === 'transparent' ? '#d8dbe5' : color }} onClick={() => setBackground(color)} aria-label={color === 'transparent' ? copy.transparentLabel : color} />
              ))}</fieldset>
            ) : null}
            {message ? <p className="error-message" role="alert">{message}</p> : null}
            {busy ? <p className="background-status" aria-live="polite">{phase === 'uploading' ? copy.uploadingLabel : copy.processingLabel}</p> : null}
            <div className="local-media-actions">
              {!resultUrl ? <button className="button button-primary" type="button" disabled={busy} onClick={processImage}>{busy ? copy.workingLabel : copy.removeBackgroundLabel}</button> : null}
              {resultUrl ? <a className="button button-primary" href={resultUrl} download="streamnest-background-removed.png"><DownloadSimpleIcon size={18} />{copy.downloadLabel}</a> : null}
              <button className="button button-ghost" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>{copy.chooseAnotherLabel}</button>
            </div>
            <input ref={inputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={onInput} />
            <p className="local-media-privacy"><ShieldCheckIcon size={20} />{copy.privacyLabel}</p>
          </aside>
        </div>
      )}
      {!selected && message ? <p className="error-message" role="alert">{message}</p> : null}
    </section>
  );
}
