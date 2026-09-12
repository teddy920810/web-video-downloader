import { useEffect, useState, type ChangeEvent } from 'react';
import { DownloadSimpleIcon } from '@phosphor-icons/react/DownloadSimple';
import { ImageIcon } from '@phosphor-icons/react/Image';
import { ShieldCheckIcon } from '@phosphor-icons/react/ShieldCheck';
import { validateLocalImage, type ImageFormat, type ImageToolMode } from '../../lib/image/browser-image';
import { trackToolEvent } from '../../lib/analytics/tool-events';
import ProcessingOverlay from '../shared/ProcessingOverlay';
import BatchWorkspace from '../shared/BatchWorkspace';
import TargetSizeField from '../shared/TargetSizeField';
import { processLocalImage } from '../shared/batch-processors';
import { targetBytes } from '../../lib/media/target-size';
import ColorSwatches from '../shared/ColorSwatches';

export default function LocalImageTool({ mode, heading, chooseLabel = 'Choose an image file' }: { mode: ImageToolMode; heading: string; chooseLabel?: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; name: string; bytes: number } | null>(null);
  const [format, setFormat] = useState<ImageFormat>('png');
  const [background, setBackground] = useState('#ffffff');
  const [quality, setQuality] = useState(0.72);
  const [width, setWidth] = useState(1280);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batch, setBatch] = useState<File[] | null>(null);
  const [size, setSize] = useState('');
  const [unit, setUnit] = useState<'KB' | 'MB'>('KB');

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  function select(event: ChangeEvent<HTMLInputElement>) {
    if ((event.target.files?.length ?? 0) > 1) { setBatch(Array.from(event.target.files!)); return; }
    const selected = event.target.files?.[0];
    if (!selected) return;
    const validation = validateLocalImage(selected);
    if (!validation.ok) { setError(validation.message); event.target.value = ''; return; }
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setResult(null);
    setError(null);
    setBatch([selected]);
  }

  async function process() {
    if (!file) return;
    setBusy(true);
    setResult(null);
    const toolId = `image-${mode}`;
    trackToolEvent(toolId, 'started', 'local');
    setError(null);
    try {
      const { blob, name } = await processLocalImage(file, mode, { format, quality, width, background, ...(mode === 'compressor' && size ? { targetBytes: targetBytes(size, unit) } : {}) });
      setResult({ url: URL.createObjectURL(blob), name, bytes: blob.size });
      trackToolEvent(toolId, 'succeeded', 'local');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The image could not be processed in this browser.');
      trackToolEvent(toolId, 'failed', 'local');
    } finally { setBusy(false); }
  }

  if (batch) return <section className="local-media-tool" data-workspace="true"><h2 id={`${mode}-image-tool-title`}>{heading}</h2><BatchWorkspace toolId={`image-${mode}`} initialFiles={batch} accept="image/jpeg,image/png,image/webp" onClose={() => setBatch(null)}
    settings={<>
      {mode === 'converter' ? <label className="local-media-field">Output format<select value={format} onChange={e => setFormat(e.target.value as ImageFormat)}><option value="png">PNG</option><option value="jpeg">JPG</option><option value="webp">WebP</option></select></label> : null}
      {mode === 'converter' && format === 'jpeg' ? <ColorSwatches label="Fill transparent areas" value={background} onChange={setBackground} transparent={false} /> : null}
      {mode === 'resizer' ? <label className="local-media-field">Maximum width · pixels<input type="number" value={width} onChange={e => setWidth(Number(e.target.value))} /></label> : null}
      {mode === 'compressor' ? <><label className="local-media-field">Output quality<input type="range" min="0.35" max="0.9" step="0.01" value={quality} onChange={e => setQuality(Number(e.target.value))} /></label><TargetSizeField value={size} unit={unit} onValue={setSize} onUnit={setUnit} /><p>Target applies to each image. Very small targets may require resizing first.</p></> : null}
    </>}
    process={files => processLocalImage(files[0], mode, { format, quality, width, background, ...(mode === 'compressor' && size ? { targetBytes: targetBytes(size, unit) } : {}) })} /></section>;

  return <section className="local-media-tool local-image-tool" data-workspace={file ? 'true' : 'false'} aria-labelledby={`${mode}-image-tool-title`} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!busy && e.dataTransfer.files.length) setBatch(Array.from(e.dataTransfer.files)); }}>
    <div className="local-media-heading"><span className="local-media-icon"><ImageIcon size={28} /></span><div><p>Private browser tool</p><h2 id={`${mode}-image-tool-title`} tabIndex={-1}>{heading}</h2></div></div>
    <div className={file ? 'local-media-workspace' : undefined}>
      {preview ? <div className="local-image-preview"><img src={result?.url ?? preview} alt={result ? 'Processed image preview' : 'Selected image preview'} />{busy ? <ProcessingOverlay label="Processing locally…" /> : null}</div> : null}
      <div className="local-media-controls">
        <label className="local-file-picker"><ImageIcon size={34} /><strong>{file?.name ?? chooseLabel}</strong><span>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : 'JPG, PNG, or WebP · up to 50 MB'}</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={select} /></label>
        <button type="button" className="button button-ghost" disabled={busy} onClick={() => setBatch(file ? [file] : [])}>Batch processing</button>
        {mode === 'converter' ? <label className="local-media-field"><span>Output format</span><select value={format} onChange={(event) => setFormat(event.target.value as ImageFormat)}><option value="png">PNG</option><option value="jpeg">JPG</option><option value="webp">WebP</option></select></label> : null}
        {mode === 'converter' && format === 'jpeg' ? <ColorSwatches label="Fill transparent areas" value={background} onChange={setBackground} transparent={false} disabled={busy} /> : null}
        {mode === 'compressor' ? <label className="local-media-field"><span>Output quality · {Math.round(quality * 100)}%</span><input type="range" min="0.35" max="0.9" step="0.01" value={quality} onChange={(event) => setQuality(Number(event.target.value))} /></label> : null}
        {mode === 'compressor' ? <TargetSizeField value={size} unit={unit} onValue={setSize} onUnit={setUnit} disabled={busy} /> : null}
        {mode === 'resizer' ? <label className="local-media-field"><span>Maximum width · pixels</span><input type="number" min="1" max="8192" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label> : null}
        {error ? <p className="error-message" role="alert">{error}</p> : null}
        {result ? <p className="local-image-result-meta" aria-live="polite">Ready · {(result.bytes / 1024).toFixed(0)} KB</p> : null}
        <div className="local-media-actions"><button className="button button-primary" type="button" disabled={!file || busy} onClick={process}>{busy ? 'Processing locally…' : mode === 'converter' ? 'Convert locally' : mode === 'compressor' ? 'Compress locally' : 'Resize locally'}</button>{result ? <a className="button button-primary" href={result.url} download={result.name}><DownloadSimpleIcon size={18} />Save {result.name}</a> : null}</div>
        <p className="local-media-privacy"><ShieldCheckIcon size={20} />Your selected image stays on this device and is not uploaded.</p>
      </div>
    </div>
  </section>;
}
