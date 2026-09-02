import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react/ArrowCounterClockwise';
import { DownloadSimpleIcon } from '@phosphor-icons/react/DownloadSimple';
import { FileVideoIcon } from '@phosphor-icons/react/FileVideo';
import { ShieldCheckIcon } from '@phosphor-icons/react/ShieldCheck';
import { StopCircleIcon } from '@phosphor-icons/react/StopCircle';
import {
  assessBrowserMediaRisk,
  buildCompressionPlanAttempts,
  buildConversionPlanAttempts,
  buildAudioExtractionPlanAttempts,
  buildGifPlanAttempts,
  buildTrimPlanAttempts,
  describeBrowserMediaError,
  validateLocalVideo,
  type CompressionPreset,
  type ConversionTarget,
} from '../../lib/media/browser-media';
import { BrowserMediaJobCancelledError, runBrowserMediaPlans } from '../../lib/media/browser-job';
import type { BrowserMediaRuntime } from '../../lib/media/ffmpeg-runtime';
import type { LocalMediaToolCopy } from '../../lib/content/utilities-settings';
import { trackToolEvent } from '../../lib/analytics/tool-events';
import ProcessingOverlay from '../shared/ProcessingOverlay';

type Mode = 'converter' | 'compressor' | 'trimmer' | 'audio' | 'gif';
type Props = { mode: Mode; copy: LocalMediaToolCopy; heading?: string };
type Phase = 'idle' | 'loading' | 'processing' | 'ready' | 'failed';

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

const ACTION_LABELS: Record<Mode, string> = {
  converter: 'Convert locally',
  compressor: 'Compress locally',
  trimmer: 'Trim locally',
  audio: 'Extract audio locally',
  gif: 'Create GIF locally',
};

export default function LocalVideoTool({ mode, copy, heading }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState<ConversionTarget>('mp4');
  const [compressionPreset, setCompressionPreset] = useState<CompressionPreset>('balanced');
  const [audioTarget, setAudioTarget] = useState<'mp3' | 'wav'>('mp3');
  const [startSeconds, setStartSeconds] = useState(0);
  const [endSeconds, setEndSeconds] = useState(10);
  const [gifDuration, setGifDuration] = useState(5);
  const [gifWidth, setGifWidth] = useState(640);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; name: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<{ durationSeconds?: number; width?: number; height?: number }>({});
  const [retrying, setRetrying] = useState(false);
  const runtime = useRef<BrowserMediaRuntime | null>(null);
  const cancelRequested = useRef(false);

  useEffect(() => () => runtime.current?.terminate(), []);
  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url);
  }, [result]);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function resetResult() {
    if (result) URL.revokeObjectURL(result.url);
    setResult(null);
    setProgress(0);
    setError(null);
    setPhase('idle');
    setRetrying(false);
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    resetResult();
    const selected = event.target.files?.[0] ?? null;
    if (!selected) {
      setFile(null);
      setPreviewUrl(null);
      setVideoMetadata({});
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
    setVideoMetadata({});
    setPreviewUrl(URL.createObjectURL(selected));
  }

  async function processVideo() {
    if (!file) return;
    resetResult();
    cancelRequested.current = false;
    setPhase('loading');
    const toolId = mode === 'audio' ? 'audio-extractor' : mode === 'gif' ? 'video-to-gif' : `video-${mode}`;
    trackToolEvent(toolId, 'started', 'local');
    try {
      const risk = assessBrowserMediaRisk({ size: file.size, ...videoMetadata });
      const plans = mode === 'converter'
        ? buildConversionPlanAttempts(file.name, target, risk)
        : mode === 'compressor'
          ? buildCompressionPlanAttempts(file.name, compressionPreset, risk)
          : mode === 'trimmer'
            ? buildTrimPlanAttempts(file.name, { startSeconds, endSeconds }, risk)
            : mode === 'audio'
              ? buildAudioExtractionPlanAttempts(file.name, audioTarget)
              : buildGifPlanAttempts(file.name, { startSeconds, durationSeconds: gifDuration, width: gifWidth }, risk);
      setPhase('processing');
      const blob = await runBrowserMediaPlans({
        files: [file],
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
          trackToolEvent(toolId, 'retried', 'local');
        },
        isCancelled: () => cancelRequested.current,
      });
      setResult({ url: URL.createObjectURL(blob), name: plans[0].outputName });
      setProgress(1);
      setPhase('ready');
      trackToolEvent(toolId, 'succeeded', 'local');
    } catch (cause) {
      const cancelled = cause instanceof BrowserMediaJobCancelledError || cancelRequested.current;
      setError(cancelled ? 'Processing was cancelled.' : describeBrowserMediaError(cause));
      setPhase('failed');
      if (!cancelled) trackToolEvent(toolId, 'failed', 'local');
    }
  }

  function cancel() {
    cancelRequested.current = true;
    runtime.current?.terminate();
    runtime.current = null;
    setError('Processing was cancelled.');
    setPhase('failed');
    const toolId = mode === 'audio' ? 'audio-extractor' : mode === 'gif' ? 'video-to-gif' : `video-${mode}`;
    trackToolEvent(toolId, 'cancelled', 'local');
  }

  const busy = phase === 'loading' || phase === 'processing';
  const risk = file ? assessBrowserMediaRisk({ size: file.size, ...videoMetadata }) : null;
  const productIcon = mode === 'converter' ? '/assets/tools/converter-logo.svg' : mode === 'compressor' ? '/assets/tools/compressor-logo.svg' : null;
  const toolHeading = heading ?? (mode === 'converter' ? copy.converterHeading : copy.compressorHeading);

  return (
    <section className="local-media-tool" data-workspace={file ? 'true' : 'false'} aria-labelledby={`${mode}-tool-title`}>
      <div className="local-media-heading">
        <span className="local-media-icon" aria-hidden="true">{productIcon ? <img className="local-media-product-icon" src={productIcon} alt="" /> : <FileVideoIcon size={28} />}</span>
        <div>
          <p>{copy.privateLabel}</p>
          <h2 id={`${mode}-tool-title`}>{toolHeading}</h2>
        </div>
      </div>

      <div className={file ? 'local-media-workspace' : undefined}>
        {file && previewUrl ? <div className="local-media-preview-shell"><video className="local-media-preview" src={previewUrl} controls={!busy} preload="metadata" onLoadedMetadata={(event) => setVideoMetadata({ durationSeconds: event.currentTarget.duration, width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })} />{busy ? <ProcessingOverlay label={retrying ? 'Retrying with a browser-safe profile…' : phase === 'loading' ? copy.loadingLabel : copy.processingLabel} progress={progress} /> : null}</div> : null}
        <div className="local-media-controls">
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
      ) : mode === 'compressor' ? (
        <label className="local-media-field">
          <span>{copy.compressionLevelLabel}</span>
          <select value={compressionPreset} disabled={busy} onChange={(event) => setCompressionPreset(event.target.value as CompressionPreset)}>
            <option value="small">{copy.smallLabel}</option>
            <option value="balanced">{copy.balancedLabel}</option>
            <option value="quality">{copy.qualityLabel}</option>
          </select>
        </label>
      ) : mode === 'audio' ? (
        <label className="local-media-field"><span>Audio format</span><select value={audioTarget} disabled={busy} onChange={(event) => setAudioTarget(event.target.value as 'mp3' | 'wav')}><option value="mp3">MP3 · 192 kbps</option><option value="wav">WAV · lossless PCM</option></select></label>
      ) : mode === 'trimmer' ? (
        <div className="local-media-field-row"><label className="local-media-field"><span>Start time · seconds</span><input type="number" min="0" step="0.1" value={startSeconds} disabled={busy} onChange={(event) => setStartSeconds(Number(event.target.value))} /></label><label className="local-media-field"><span>End time · seconds</span><input type="number" min="0.1" step="0.1" value={endSeconds} disabled={busy} onChange={(event) => setEndSeconds(Number(event.target.value))} /></label></div>
      ) : (
        <div className="local-media-field-row"><label className="local-media-field"><span>Start · seconds</span><input type="number" min="0" step="0.1" value={startSeconds} disabled={busy} onChange={(event) => setStartSeconds(Number(event.target.value))} /></label><label className="local-media-field"><span>Duration · up to 30 seconds</span><input type="number" min="1" max="30" value={gifDuration} disabled={busy} onChange={(event) => setGifDuration(Number(event.target.value))} /></label><label className="local-media-field"><span>GIF width</span><select value={gifWidth} disabled={busy} onChange={(event) => setGifWidth(Number(event.target.value))}><option value="480">480 px</option><option value="640">640 px</option><option value="960">960 px</option></select></label></div>
      )}

      {risk && risk.level !== 'standard' ? <p className="local-media-compatibility" role="status">This video may need compatibility mode. If the first attempt fails, Streamnest will retry once with a lower-memory profile.</p> : null}

      {error ? <p className="error-message" role="alert">{error}</p> : null}

      <div className="local-media-actions">
        {busy ? (
          <button className="button button-ghost" type="button" onClick={cancel}><StopCircleIcon size={18} />{copy.cancelLabel}</button>
        ) : (
          <button className="button button-primary" type="button" disabled={!file} onClick={processVideo}>
            <ArrowCounterClockwiseIcon size={18} />{mode === 'converter' ? copy.convertLabel : mode === 'compressor' ? copy.compressLabel : ACTION_LABELS[mode]}
          </button>
        )}
        {result ? <a className="button button-primary" href={result.url} download={result.name}><DownloadSimpleIcon size={18} />{copy.saveLabel} {result.name}</a> : null}
      </div>

      <p className="local-media-privacy"><ShieldCheckIcon size={20} aria-hidden="true" />{copy.privacyLabel}</p>
        </div>
      </div>
    </section>
  );
}
