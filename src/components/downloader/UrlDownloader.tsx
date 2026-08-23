import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { ClockIcon } from '@phosphor-icons/react/Clock';
import { DownloadSimpleIcon } from '@phosphor-icons/react/DownloadSimple';
import { FileIcon } from '@phosphor-icons/react/File';
import { LinkSimpleIcon } from '@phosphor-icons/react/LinkSimple';
import { MonitorIcon } from '@phosphor-icons/react/Monitor';
import { MusicNoteIcon } from '@phosphor-icons/react/MusicNote';
import { ShieldCheckIcon } from '@phosphor-icons/react/ShieldCheck';
import { UserCircleIcon } from '@phosphor-icons/react/UserCircle';
import { VideoCameraIcon } from '@phosphor-icons/react/VideoCamera';
import { XIcon } from '@phosphor-icons/react/X';
import { fetchWithPolicy } from '../../lib/api/service-client';
import { isDesktopOnly } from '../../lib/download/policy';
import { authClient } from '../auth/auth-client';

const platforms = ['YouTube', 'TikTok', 'Instagram'];

type MediaFormat = {
  formatId: string;
  label: string;
  container: string;
  height: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
  audioBitrateKbps: number | null;
  estimatedSizeBytes: number | null;
};

type MediaAnalysis = {
  platform: string;
  title: string;
  thumbnail: string | null;
  durationSeconds: number | null;
  formats: MediaFormat[];
};

type Modal = 'desktop' | 'signin' | null;

export default function UrlDownloader() {
  const { data: session } = authClient.useSession();
  const [url, setUrl] = useState('');
  const [analysis, setAnalysis] = useState<MediaAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const savedUrl = window.sessionStorage.getItem('pending-download-url');
    if (savedUrl) {
      window.sessionStorage.removeItem('pending-download-url');
      setUrl(savedUrl);
    }
    return () => activeRequest.current?.abort();
  }, []);

  useEffect(() => {
    if (!modal) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModal(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [modal]);

  function beginRequest() {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    return controller;
  }

  const submit: NonNullable<ComponentProps<'form'>['onSubmit']> = async (event) => {
    event.preventDefault();
    const controller = beginRequest();
    setPending(true);
    setAnalysis(null);
    setDownloadUrl(null);
    setError(null);
    try {
      const response = await fetchWithPolicy('/api/downloads/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      }, { timeoutMs: 20_000, retries: 1, signal: controller.signal });
      const body = await response.json() as MediaAnalysis & { error?: string };
      if (!response.ok) {
        setError(body.error ?? 'Unable to analyze this link. Please try again.');
        return;
      }
      setAnalysis(body);
    } catch {
      if (!controller.signal.aborted) setError('Unable to analyze this link. Please try again.');
    } finally {
      if (activeRequest.current === controller) setPending(false);
    }
  };

  async function signInToContinue() {
    window.sessionStorage.setItem('pending-download-url', url);
    await authClient.signIn.social({ provider: 'google', callbackURL: `${window.location.origin}/#tool` });
  }

  function chooseFormat(format: MediaFormat) {
    if (!analysis) return;
    if (isDesktopOnly({ durationSeconds: analysis.durationSeconds, height: format.height })) {
      setModal('desktop');
      return;
    }
    if (!session?.user) {
      setModal('signin');
      return;
    }
    void prepareDownload(format.formatId);
  }

  async function prepareDownload(formatId: string) {
    const controller = beginRequest();
    setPending(true);
    setDownloadUrl(null);
    setError(null);
    try {
      const response = await fetchWithPolicy('/api/downloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), formatId }),
      }, { timeoutMs: 15_000, signal: controller.signal });
      const body = await response.json() as { jobId?: string; error?: string };
      if (!response.ok || !body.jobId) {
        setError(body.error ?? 'Unable to prepare this file. Please try again.');
        return;
      }
      await pollDownload(body.jobId, controller.signal);
    } catch {
      if (!controller.signal.aborted) setError('Unable to prepare this file. Please try again.');
    } finally {
      if (activeRequest.current === controller) setPending(false);
    }
  }

  async function pollDownload(jobId: string, signal: AbortSignal) {
    for (let poll = 0; poll < 90; poll += 1) {
      await abortableDelay(2_000, signal);
      const response = await fetchWithPolicy(`/api/downloads/${encodeURIComponent(jobId)}`, {
        method: 'GET', headers: { Accept: 'application/json' },
      }, { timeoutMs: 8_000, retries: 2, signal });
      const body = await response.json() as { status?: string; downloadUrl?: string; error?: string };
      if (!response.ok || body.status === 'failed') {
        setError(body.error ?? 'Unable to prepare this file. Please try again.');
        return;
      }
      if (body.status === 'ready' && body.downloadUrl) {
        setDownloadUrl(body.downloadUrl);
        return;
      }
    }
    setError('Unable to prepare this file. Please try again.');
  }

  return (
    <section className="download-card" aria-labelledby="download-tool-title">
      <div className="download-card-heading">
        <span className="download-card-icon" aria-hidden="true"><DownloadSimpleIcon size={24} weight="bold" /></span>
        <div><p>Free web trial</p><h2 id="download-tool-title">Paste a video link</h2></div>
      </div>
      <form onSubmit={submit}>
        <label className="sr-only" htmlFor="video-url">Video URL</label>
        <div className="url-entry">
          <span className="url-entry-icon" aria-hidden="true"><LinkSimpleIcon size={20} /></span>
          <input id="video-url" value={url} onChange={(event) => setUrl(event.target.value)} type="url" placeholder="Paste a public video URL" required />
          <button className="button button-primary" type="submit" disabled={pending}>{pending ? 'Analyzing…' : 'Analyze'}</button>
        </div>
      </form>

      {error ? <p className="error-message" role="alert">{error}</p> : null}
      {analysis ? <MediaResults analysis={analysis} pending={pending} onDownload={chooseFormat} /> : null}
      {downloadUrl ? <a className="button button-primary download-sign-in" href={downloadUrl} rel="noreferrer">Download your file</a> : null}

      <div className="trial-limits">
        <span><UserCircleIcon size={19} aria-hidden="true" />1 free trial / account</span>
        <span><MonitorIcon size={19} aria-hidden="true" />Web up to 720p</span>
        <span><ClockIcon size={19} aria-hidden="true" />Web up to 10 min</span>
        <span><FileIcon size={19} aria-hidden="true" />500 MB safety limit</span>
      </div>
      <p className="download-policy-note"><ShieldCheckIcon size={22} aria-hidden="true" /><span>Preview formats before signing in. One eligible web download per account.<br />Files are delivered through a temporary private link.</span></p>
      <p className="supported-platforms">Popular sources: {platforms.map((platform) => <b key={platform}>{platform}</b>)}</p>

      {modal ? (
        <div className="download-modal-backdrop" role="presentation" onMouseDown={() => setModal(null)}>
          <section className="download-modal" role="dialog" aria-modal="true" aria-labelledby={`${modal}-modal-title`} onMouseDown={(event) => event.stopPropagation()}>
            <button className="download-modal-close" type="button" aria-label="Close dialog" onClick={() => setModal(null)}><XIcon size={20} /></button>
            <span className="download-modal-icon" aria-hidden="true"><MonitorIcon size={32} weight="duotone" /></span>
            {modal === 'desktop' ? (
              <>
                <p>Desktop download</p>
                <h3 id="desktop-modal-title">Desktop app coming soon</h3>
                <small>This format is above the 720p web limit, or the video is longer than 10 minutes. The desktop experience is on the way.</small>
                <button className="button button-primary" type="button" disabled>Coming soon</button>
              </>
            ) : (
              <>
                <p>One free web trial</p>
                <h3 id="signin-modal-title">Sign in to start your download</h3>
                <small>Format inspection stays open to everyone. Google sign-in is only required when you start an eligible web download.</small>
                <button className="button button-primary" type="button" onClick={() => void signInToContinue()}>Continue with Google</button>
              </>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function MediaResults({ analysis, pending, onDownload }: { analysis: MediaAnalysis; pending: boolean; onDownload: (format: MediaFormat) => void }) {
  return (
    <div className="media-results">
      <div className="media-information">
        {analysis.thumbnail ? <img src={analysis.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="media-thumbnail-fallback" aria-hidden="true"><VideoCameraIcon size={34} /></span>}
        <div>
          <span>{analysis.platform}</span>
          <strong>{analysis.title}</strong>
          <small>{formatDuration(analysis.durationSeconds)} · {analysis.formats.length} formats found</small>
        </div>
      </div>
      <div className="media-format-panel">
        <div className="media-format-heading"><div><span>Choose a resource</span><h3>Available downloads</h3></div><small>Web-ready formats download here. Larger options open the desktop preview.</small></div>
        <div className="media-format-list">
          {analysis.formats.map((format) => {
            const desktopOnly = isDesktopOnly({ durationSeconds: analysis.durationSeconds, height: format.height });
            return (
              <div className="media-format-row" key={format.formatId}>
                <span className="media-format-kind" aria-hidden="true">{format.hasVideo ? <VideoCameraIcon size={20} /> : <MusicNoteIcon size={20} />}</span>
                <div className="media-format-copy">
                  <strong>{format.label}</strong>
                  <small>{format.container.toUpperCase()} · {format.hasVideo ? format.hasAudio ? 'Video + audio' : 'Video + best audio' : 'Audio only'}{format.estimatedSizeBytes ? ` · ${formatBytes(format.estimatedSizeBytes)}` : ''}</small>
                </div>
                {desktopOnly ? <span className="desktop-format-badge">Desktop</span> : <span className="web-format-badge">Web</span>}
                <button className="button media-format-download" type="button" disabled={pending} aria-label={`Download ${format.label} ${format.container.toUpperCase()}`} onClick={() => onDownload(format)}>Download</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return 'Duration unavailable';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}

function abortableDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const finish = () => {
      signal.removeEventListener('abort', cancel);
      resolve();
    };
    const timer = window.setTimeout(finish, milliseconds);
    const cancel = () => {
      window.clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener('abort', cancel, { once: true });
  });
}
