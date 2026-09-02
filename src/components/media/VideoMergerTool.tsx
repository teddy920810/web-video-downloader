import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { DownloadSimpleIcon } from '@phosphor-icons/react/DownloadSimple';
import { FileVideoIcon } from '@phosphor-icons/react/FileVideo';
import { ShieldCheckIcon } from '@phosphor-icons/react/ShieldCheck';
import { StopCircleIcon } from '@phosphor-icons/react/StopCircle';
import { assessBrowserMediaRisk, buildMergePlanAttempts, describeBrowserMediaError, validateLocalVideo } from '../../lib/media/browser-media';
import { BrowserMediaJobCancelledError, runBrowserMediaPlans } from '../../lib/media/browser-job';
import type { BrowserMediaRuntime } from '../../lib/media/ffmpeg-runtime';
import ProcessingOverlay from '../shared/ProcessingOverlay';

const MAX_TOTAL_BYTES = 250 * 1024 * 1024;

export default function VideoMergerTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'processing' | 'ready' | 'failed'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const runtime = useRef<BrowserMediaRuntime | null>(null);
  const cancelRequested = useRef(false);

  useEffect(() => () => runtime.current?.terminate(), []);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result); }, [result]);

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    setError(null);
    setResult(null);
    if (selected.length < 2 || selected.length > 10) return setError('Choose between 2 and 10 compatible clips.');
    const invalid = selected.find((file) => !validateLocalVideo(file).ok);
    if (invalid) return setError('Choose supported video clips under 250 MB each.');
    if (selected.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_BYTES) return setError('The selected clips must total 250 MB or less.');
    setFiles(selected);
    setRetrying(false);
    setPhase('idle');
  }

  async function merge() {
    if (files.length < 2) return;
    setError(null);
    setRetrying(false);
    cancelRequested.current = false;
    setPhase('loading');
    try {
      const risk = assessBrowserMediaRisk({ size: files.reduce((sum, file) => sum + file.size, 0) });
      const plans = buildMergePlanAttempts(files.map((file) => file.name), risk);
      setPhase('processing');
      const blob = await runBrowserMediaPlans({
        files,
        plans,
        createRuntime: async () => {
          const { createBrowserMediaRuntime } = await import('../../lib/media/ffmpeg-runtime');
          return createBrowserMediaRuntime();
        },
        onProgress: setProgress,
        onRuntime: (current) => { runtime.current = current; },
        onRetry: () => {
          setRetrying(true);
          setProgress(0);
        },
        isCancelled: () => cancelRequested.current,
      });
      setResult(URL.createObjectURL(blob));
      setProgress(1);
      setPhase('ready');
    } catch (cause) {
      const cancelled = cause instanceof BrowserMediaJobCancelledError || cancelRequested.current;
      setError(cancelled ? 'Processing was cancelled.' : describeBrowserMediaError(cause));
      setPhase('failed');
    }
  }

  const busy = phase === 'loading' || phase === 'processing';
  return <section className="local-media-tool" data-workspace={files.length > 0 ? 'true' : 'false'} aria-labelledby="video-merger-tool-title">
    <div className="local-media-heading"><span className="local-media-icon"><FileVideoIcon size={28} /></span><div><p>Private browser tool</p><h2 id="video-merger-tool-title">Merge compatible video clips</h2></div></div>
    <div className="local-media-controls">
      <label className="local-file-picker"><FileVideoIcon size={34} /><strong>{files.length ? `${files.length} clips selected` : 'Choose 2–10 video clips'}</strong><span>For best results, use clips from the same camera or device · 250 MB total</span><input type="file" accept="video/*" multiple disabled={busy} onChange={selectFiles} /></label>
      {files.length ? <ol className="local-file-list">{files.map((file) => <li key={`${file.name}-${file.lastModified}`}>{file.name}<span>{(file.size / 1024 / 1024).toFixed(1)} MB</span></li>)}</ol> : null}
      {busy ? <ProcessingOverlay inline label={retrying ? 'Retrying with a browser-safe profile…' : phase === 'loading' ? 'Loading the local media engine…' : 'Merging in this browser…'} progress={progress} /> : null}
      {error ? <p className="error-message" role="alert">{error}</p> : null}
      <div className="local-media-actions">{busy ? <button className="button button-ghost" type="button" onClick={() => { cancelRequested.current = true; runtime.current?.terminate(); }}><StopCircleIcon size={18} />Cancel</button> : <button className="button button-primary" type="button" disabled={files.length < 2} onClick={merge}>Merge locally</button>}{result ? <a className="button button-primary" href={result} download="merged.mp4"><DownloadSimpleIcon size={18} />Save merged.mp4</a> : null}</div>
      <p className="local-media-privacy"><ShieldCheckIcon size={20} />Your selected clips stay on this device and are not uploaded.</p>
    </div>
  </section>;
}
