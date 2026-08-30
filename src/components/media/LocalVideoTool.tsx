import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react/ArrowCounterClockwise';
import { DownloadSimpleIcon } from '@phosphor-icons/react/DownloadSimple';
import { FileVideoIcon } from '@phosphor-icons/react/FileVideo';
import { ShieldCheckIcon } from '@phosphor-icons/react/ShieldCheck';
import { StopCircleIcon } from '@phosphor-icons/react/StopCircle';
import {
  buildCompressionPlan,
  buildConversionPlan,
  describeBrowserMediaError,
  validateLocalVideo,
  type CompressionPreset,
  type ConversionTarget,
  type MediaPlan,
} from '../../lib/media/browser-media';
import type { BrowserMediaRuntime } from '../../lib/media/ffmpeg-runtime';
import type { LocalMediaToolCopy } from '../../lib/content/utilities-settings';

type Props = { mode: 'converter' | 'compressor'; copy: LocalMediaToolCopy };
type Phase = 'idle' | 'loading' | 'processing' | 'ready' | 'failed';

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export default function LocalVideoTool({ mode, copy }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState<ConversionTarget>('mp4');
  const [compressionPreset, setCompressionPreset] = useState<CompressionPreset>('balanced');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; name: string } | null>(null);
  const runtime = useRef<BrowserMediaRuntime | null>(null);

  useEffect(() => () => runtime.current?.terminate(), []);
  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url);
  }, [result]);

  function resetResult() {
    if (result) URL.revokeObjectURL(result.url);
    setResult(null);
    setProgress(0);
    setError(null);
    setPhase('idle');
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    resetResult();
    const selected = event.target.files?.[0] ?? null;
    if (!selected) {
      setFile(null);
      return;
    }
    const validation = validateLocalVideo(selected);
    if (!validation.ok) {
      setFile(null);
      setError(validation.message);
      setPhase('failed');
      event.target.value = '';
      return;
    }
    setFile(selected);
  }

  async function processVideo() {
    if (!file) return;
    resetResult();
    setPhase('loading');
    try {
      const { createBrowserMediaRuntime } = await import('../../lib/media/ffmpeg-runtime');
      const engine = await createBrowserMediaRuntime();
      runtime.current = engine;
      const plan: MediaPlan = mode === 'converter'
        ? buildConversionPlan(file.name, target)
        : buildCompressionPlan(file.name, compressionPreset);
      setPhase('processing');
      const blob = await engine.run(file, plan, setProgress);
      setResult({ url: URL.createObjectURL(blob), name: plan.outputName });
      setProgress(1);
      setPhase('ready');
    } catch (cause) {
      setError(describeBrowserMediaError(cause));
      setPhase('failed');
    } finally {
      runtime.current?.terminate();
      runtime.current = null;
    }
  }

  function cancel() {
    runtime.current?.terminate();
    runtime.current = null;
    setError('Processing was cancelled.');
    setPhase('failed');
  }

  const busy = phase === 'loading' || phase === 'processing';
  const productIcon = mode === 'converter' ? '/assets/tools/converter-logo.svg' : '/assets/tools/compressor-logo.svg';

  return (
    <section className="local-media-tool" aria-labelledby={`${mode}-tool-title`}>
      <div className="local-media-heading">
        <span className="local-media-icon" aria-hidden="true"><img className="local-media-product-icon" src={productIcon} alt="" /></span>
        <div>
          <p>{copy.privateLabel}</p>
          <h2 id={`${mode}-tool-title`}>{mode === 'converter' ? copy.converterHeading : copy.compressorHeading}</h2>
        </div>
      </div>

      <label className="local-file-picker">
        <FileVideoIcon size={34} aria-hidden="true" />
        <strong>{file ? file.name : copy.chooseFile}</strong>
        <span>{file ? formatBytes(file.size) : copy.formatHelp}</span>
        <input type="file" accept="video/*" disabled={busy} onChange={selectFile} />
      </label>

      {mode === 'converter' ? (
        <label className="local-media-field">
          <span>{copy.outputFormatLabel}</span>
          <select value={target} disabled={busy} onChange={(event) => setTarget(event.target.value as ConversionTarget)}>
            <option value="mp4">{copy.mp4Label}</option>
            <option value="webm">{copy.webmLabel}</option>
            <option value="mp3">{copy.mp3Label}</option>
          </select>
        </label>
      ) : (
        <label className="local-media-field">
          <span>{copy.compressionLevelLabel}</span>
          <select value={compressionPreset} disabled={busy} onChange={(event) => setCompressionPreset(event.target.value as CompressionPreset)}>
            <option value="small">{copy.smallLabel}</option>
            <option value="balanced">{copy.balancedLabel}</option>
            <option value="quality">{copy.qualityLabel}</option>
          </select>
        </label>
      )}

      {busy ? (
        <div className="local-media-progress" aria-live="polite">
          <div><span>{phase === 'loading' ? copy.loadingLabel : copy.processingLabel}</span><strong>{Math.round(progress * 100)}%</strong></div>
          <progress max="1" value={progress} />
        </div>
      ) : null}
      {error ? <p className="error-message" role="alert">{error}</p> : null}

      <div className="local-media-actions">
        {busy ? (
          <button className="button button-ghost" type="button" onClick={cancel}><StopCircleIcon size={18} />{copy.cancelLabel}</button>
        ) : (
          <button className="button button-primary" type="button" disabled={!file} onClick={processVideo}>
            <ArrowCounterClockwiseIcon size={18} />{mode === 'converter' ? copy.convertLabel : copy.compressLabel}
          </button>
        )}
        {result ? <a className="button button-primary" href={result.url} download={result.name}><DownloadSimpleIcon size={18} />{copy.saveLabel} {result.name}</a> : null}
      </div>

      <p className="local-media-privacy"><ShieldCheckIcon size={20} aria-hidden="true" />{copy.privacyLabel}</p>
    </section>
  );
}
