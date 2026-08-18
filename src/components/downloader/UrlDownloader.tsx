import { useEffect, useState, type FormEvent } from 'react';
import type { DownloadUrlInspection } from '../../lib/download/policy';
import { authClient } from '../auth/auth-client';

const platforms = ['YouTube', 'TikTok', 'Instagram'];

type MediaAnalysis = {
  platform: string;
  title: string;
  thumbnail: string | null;
  durationSeconds: number;
  formats: Array<{ formatId: string; label: string; container: string; height: number; hasAudio: boolean; estimatedSizeBytes: number | null }>;
};

export default function UrlDownloader() {
  const { data: session } = authClient.useSession();
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<DownloadUrlInspection | null>(null);
  const [analysis, setAnalysis] = useState<MediaAnalysis | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const savedUrl = window.sessionStorage.getItem('pending-download-url');
    if (!savedUrl) return;
    window.sessionStorage.removeItem('pending-download-url');
    setUrl(savedUrl);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const response = await fetch('/api/downloads/check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.trim() }),
      });
      const body = await response.json() as { platform?: string; url?: string; error?: string };
      setResult(response.ok && body.platform && body.url
        ? { ok: true, platform: body.platform as Extract<DownloadUrlInspection, { ok: true }>['platform'], url: body.url }
        : { ok: false, message: body.error ?? 'Unable to analyze this link. Please try again.' });
    } catch {
      setResult({ ok: false, message: 'Unable to check this link. Please try again.' });
    } finally {
      setPending(false);
    }
  }

  async function signInToContinue() {
    window.sessionStorage.setItem('pending-download-url', url);
    await authClient.signIn.social({ provider: 'google', callbackURL: `${window.location.origin}/#tool` });
  }

  async function analyzeFormats() {
    setPending(true);
    setAnalysis(null);
    setDownloadUrl(null);
    try {
      const response = await fetch('/api/downloads/inspect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.trim() }),
      });
      const body = await response.json() as MediaAnalysis & { error?: string };
      if (!response.ok) {
        setResult({ ok: false, message: body.error ?? 'Unable to analyze this link. Please try again.' });
        return;
      }
      setAnalysis(body);
    } catch {
      setResult({ ok: false, message: 'Unable to analyze this link. Please try again.' });
    } finally {
      setPending(false);
    }
  }

  async function prepareDownload(formatId: string) {
    setPending(true);
    setDownloadUrl(null);
    try {
      const response = await fetch('/api/downloads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.trim(), formatId }),
      });
      const body = await response.json() as { downloadUrl?: string; error?: string };
      if (!response.ok || !body.downloadUrl) {
        setResult({ ok: false, message: body.error ?? 'Unable to prepare this file. Please try again.' });
        return;
      }
      setDownloadUrl(body.downloadUrl);
    } catch {
      setResult({ ok: false, message: 'Unable to prepare this file. Please try again.' });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="download-card" aria-labelledby="download-tool-title">
      <div className="download-card-heading"><span className="download-card-icon" aria-hidden="true">↓</span><div><p>Free web trial</p><h2 id="download-tool-title">Paste a video link</h2></div></div>
      <form onSubmit={submit}><label className="sr-only" htmlFor="video-url">Video URL</label><div className="url-entry"><input id="video-url" value={url} onChange={(event) => setUrl(event.target.value)} type="url" placeholder="Paste a YouTube, TikTok, or Instagram URL" required /><button className="button button-primary" type="submit" disabled={pending}>{pending ? 'Analyzing…' : 'Analyze'}</button></div></form>
      {result && !result.ok ? <p className="error-message" role="alert">{result.message}</p> : null}
      {result?.ok ? <div className="analysis-result" role="status"><span className="analysis-result-badge">{result.platform}</span><div><strong>Link supported</strong><small>{session?.user ? 'Your account is ready for format analysis.' : 'Sign in to analyze available formats.'}</small></div></div> : null}
      {result?.ok && !session?.user ? <button className="button button-primary download-sign-in" type="button" onClick={() => void signInToContinue()}>Sign in to analyze formats</button> : null}
      {result?.ok && session?.user ? <button className="button button-primary download-sign-in" type="button" disabled={pending} onClick={() => void analyzeFormats()}>{pending ? 'Analyzing…' : 'Analyze available formats'}</button> : null}
      {analysis ? <div className="analysis-result media-analysis" role="status">{analysis.thumbnail ? <img src={analysis.thumbnail} alt="" /> : null}<div><strong>{analysis.title}</strong><small>{Math.ceil(analysis.durationSeconds / 60)} min · choose an audio-ready format below</small></div></div> : null}
      {analysis?.formats.filter((format) => format.hasAudio).map((format) => <button className="button button-ghost download-format" type="button" disabled={pending} key={format.formatId} onClick={() => void prepareDownload(format.formatId)}>Download {format.label} · {format.container.toUpperCase()}</button>)}
      {downloadUrl ? <a className="button button-primary download-sign-in" href={downloadUrl}>Download your file</a> : null}
      <div className="trial-limits"><span>1 free trial / account</span><span>Up to 720p</span><span>10 min · 500 MB</span></div>
      <p className="supported-platforms">Supported today: {platforms.map((platform) => <b key={platform}>{platform}</b>)}</p>
    </section>
  );
}
