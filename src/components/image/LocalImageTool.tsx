import { useEffect, useState, type ChangeEvent } from 'react';
import { DownloadSimpleIcon } from '@phosphor-icons/react/DownloadSimple';
import { ImageIcon } from '@phosphor-icons/react/Image';
import { ShieldCheckIcon } from '@phosphor-icons/react/ShieldCheck';
import { buildImagePlan, validateLocalImage, type ImageFormat, type ImageToolMode } from '../../lib/image/browser-image';
import { trackToolEvent } from '../../lib/analytics/tool-events';

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The browser could not create this image.')), type, quality));
}

export default function LocalImageTool({ mode, heading }: { mode: ImageToolMode; heading: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; name: string; bytes: number } | null>(null);
  const [format, setFormat] = useState<ImageFormat>('png');
  const [quality, setQuality] = useState(0.72);
  const [width, setWidth] = useState(1280);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  function select(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    const validation = validateLocalImage(selected);
    if (!validation.ok) { setError(validation.message); event.target.value = ''; return; }
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setResult(null);
    setError(null);
  }

  async function process() {
    if (!file) return;
    setBusy(true);
    const toolId = `image-${mode}`;
    trackToolEvent(toolId, 'started', 'local');
    setError(null);
    try {
      const plan = buildImagePlan(mode, { format, quality, width });
      const bitmap = await createImageBitmap(file);
      const outputWidth = plan.width ? Math.min(plan.width, bitmap.width) : bitmap.width;
      const outputHeight = Math.max(1, Math.round(bitmap.height * (outputWidth / bitmap.width)));
      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas processing is not available in this browser.');
      context.drawImage(bitmap, 0, 0, outputWidth, outputHeight);
      bitmap.close();
      const blob = await canvasBlob(canvas, plan.mimeType, plan.quality);
      const name = `${mode === 'converter' ? 'converted' : mode === 'compressor' ? 'compressed' : 'resized'}.${plan.extension}`;
      setResult({ url: URL.createObjectURL(blob), name, bytes: blob.size });
      trackToolEvent(toolId, 'succeeded', 'local');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The image could not be processed in this browser.');
      trackToolEvent(toolId, 'failed', 'local');
    } finally { setBusy(false); }
  }

  return <section className="local-media-tool local-image-tool" data-workspace={file ? 'true' : 'false'} aria-labelledby={`${mode}-image-tool-title`}>
    <div className="local-media-heading"><span className="local-media-icon"><ImageIcon size={28} /></span><div><p>Private browser tool</p><h2 id={`${mode}-image-tool-title`}>{heading}</h2></div></div>
    <div className={file ? 'local-media-workspace' : undefined}>
      {preview ? <div className="local-image-preview"><img src={result?.url ?? preview} alt={result ? 'Processed image preview' : 'Selected image preview'} /></div> : null}
      <div className="local-media-controls">
        <label className="local-file-picker"><ImageIcon size={34} /><strong>{file?.name ?? 'Choose an image file'}</strong><span>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : 'JPG, PNG, or WebP · up to 50 MB'}</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={select} /></label>
        {mode === 'converter' ? <label className="local-media-field"><span>Output format</span><select value={format} onChange={(event) => setFormat(event.target.value as ImageFormat)}><option value="png">PNG</option><option value="jpeg">JPG</option><option value="webp">WebP</option></select></label> : null}
        {mode === 'compressor' ? <label className="local-media-field"><span>Output quality · {Math.round(quality * 100)}%</span><input type="range" min="0.35" max="0.9" step="0.01" value={quality} onChange={(event) => setQuality(Number(event.target.value))} /></label> : null}
        {mode === 'resizer' ? <label className="local-media-field"><span>Maximum width · pixels</span><input type="number" min="1" max="8192" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label> : null}
        {error ? <p className="error-message" role="alert">{error}</p> : null}
        {result ? <p className="local-image-result-meta" aria-live="polite">Ready · {(result.bytes / 1024).toFixed(0)} KB</p> : null}
        <div className="local-media-actions"><button className="button button-primary" type="button" disabled={!file || busy} onClick={process}>{busy ? 'Processing locally…' : mode === 'converter' ? 'Convert locally' : mode === 'compressor' ? 'Compress locally' : 'Resize locally'}</button>{result ? <a className="button button-primary" href={result.url} download={result.name}><DownloadSimpleIcon size={18} />Save {result.name}</a> : null}</div>
        <p className="local-media-privacy"><ShieldCheckIcon size={20} />Your selected image stays on this device and is not uploaded.</p>
      </div>
    </div>
  </section>;
}
