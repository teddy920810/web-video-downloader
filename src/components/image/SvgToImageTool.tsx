import { useEffect, useState } from 'react';
import { CodeIcon } from '@phosphor-icons/react/Code';
import { DownloadSimpleIcon } from '@phosphor-icons/react/DownloadSimple';
import { ImageIcon } from '@phosphor-icons/react/Image';
import { LinkIcon } from '@phosphor-icons/react/Link';
import { ShieldCheckIcon } from '@phosphor-icons/react/ShieldCheck';
import { rasterizeSvg, outputForSvgFormat, type SvgOutputFormat, MAX_SVG_SOURCE_BYTES } from '../../lib/image/svg-raster';
import { trackToolEvent } from '../../lib/analytics/tool-events';
import ProcessingOverlay from '../shared/ProcessingOverlay';

async function svgFromUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Enter a valid SVG URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an HTTP or HTTPS SVG URL.');
  const response = await fetch(url, { headers: { Accept: 'image/svg+xml,text/plain;q=0.8' } });
  if (!response.ok) throw new Error(`The SVG URL returned ${response.status}.`);
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > MAX_SVG_SOURCE_BYTES) throw new Error('SVG URLs must return no more than 2 MB.');
  const source = await response.text();
  if (new TextEncoder().encode(source).byteLength > MAX_SVG_SOURCE_BYTES) throw new Error('SVG URLs must return no more than 2 MB.');
  return source;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function SvgToImageTool() {
  const [sourceMode, setSourceMode] = useState<'code' | 'url'>('code');
  const [code, setCode] = useState('');
  const [svgUrl, setSvgUrl] = useState('');
  const [format, setFormat] = useState<SvgOutputFormat>('png');
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function chooseMode(mode: 'code' | 'url') {
    setSourceMode(mode);
    setError(null);
  }

  async function convertAndSave() {
    setBusy(true);
    setError(null);
    trackToolEvent('svg-to-image', 'started', 'local');
    try {
      const source = sourceMode === 'url' ? await svgFromUrl(svgUrl.trim()) : code;
      const blob = await rasterizeSvg(source, format);
      setPreview(URL.createObjectURL(blob));
      const output = outputForSvgFormat(format);
      saveBlob(blob, `streamnest-svg.${output.extension}`);
      trackToolEvent('svg-to-image', 'succeeded', 'local');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The SVG could not be converted in this browser.');
      trackToolEvent('svg-to-image', 'failed', 'local');
    } finally {
      setBusy(false);
    }
  }

  const canSave = sourceMode === 'code' ? code.trim().length > 0 : svgUrl.trim().length > 0;
  const saveLabel = format === 'png' ? 'Save PNG' : format === 'jpeg' ? 'Save JPG' : 'Save WebP';

  return <section className="local-media-tool svg-image-tool" data-workspace={preview ? 'true' : 'false'} aria-labelledby="svg-image-tool-title">
    <div className="local-media-heading"><span className="local-media-icon"><ImageIcon size={28} /></span><div><p>Private browser tool</p><h2 id="svg-image-tool-title">Convert SVG to an image</h2></div></div>
    <div className={preview ? 'local-media-workspace' : undefined}>
      {preview ? <div className="local-image-preview"><img src={preview} alt="Converted SVG preview" />{busy ? <ProcessingOverlay label="Rendering SVG locally…" /> : null}</div> : null}
      <div className="local-media-controls">
        <div className="svg-source-tabs" aria-label="SVG input type">
          <button className={sourceMode === 'code' ? 'is-selected' : ''} type="button" aria-pressed={sourceMode === 'code'} onClick={() => chooseMode('code')}><CodeIcon size={18} />Use code</button>
          <button className={sourceMode === 'url' ? 'is-selected' : ''} type="button" aria-pressed={sourceMode === 'url'} onClick={() => chooseMode('url')}><LinkIcon size={18} />Use URL</button>
        </div>
        {sourceMode === 'code' ? <label className="local-media-field svg-code-field"><span>SVG code</span><textarea value={code} placeholder={'<svg viewBox="0 0 100 100">…</svg>'} disabled={busy} onChange={(event) => setCode(event.target.value)} /></label> : <label className="local-media-field"><span>SVG URL</span><input type="url" value={svgUrl} placeholder="https://example.com/icon.svg" disabled={busy} onChange={(event) => setSvgUrl(event.target.value)} /></label>}
        <label className="local-media-field"><span>Output format</span><select value={format} disabled={busy} onChange={(event) => setFormat(event.target.value as SvgOutputFormat)}><option value="png">PNG</option><option value="jpeg">JPG</option><option value="webp">WebP</option></select></label>
        {error ? <p className="error-message" role="alert">{error}</p> : null}
        {busy ? <ProcessingOverlay label="Rendering SVG locally…" inline /> : null}
        <div className="local-media-actions"><button className="button button-primary" type="button" disabled={!canSave || busy} onClick={convertAndSave}><DownloadSimpleIcon size={18} />{saveLabel}</button></div>
        <p className="local-media-privacy"><ShieldCheckIcon size={20} />SVG code and image conversion stay in this browser. URL input is fetched directly by your browser.</p>
      </div>
    </div>
  </section>;
}
