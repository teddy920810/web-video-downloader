import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SerialQueue } from '../../lib/batch/serial-queue';
import ProcessingOverlay from './ProcessingOverlay';
import type { BatchResult } from './batch-processors';
import type { BrowserMediaRuntime } from '../../lib/media/ffmpeg-runtime';

type StoredResult = { url: string; name: string; bytes: number };
const EMPTY_FILES: File[] = [];
type Props = {
  initialFiles?: File[]; accept: string; group?: boolean; cloud?: boolean; settings?: ReactNode;
  process: (files: File[], progress: (n: number) => void, runtime: (r: BrowserMediaRuntime | null) => void, cancelled: () => boolean) => Promise<BatchResult>;
  onClose: () => void; ready?: boolean;
};

export default function BatchWorkspace({ initialFiles = EMPTY_FILES, accept, group, cloud, settings, process, onClose, ready = true }: Props) {
  const [, redraw] = useState(0);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [stopping, setStopping] = useState(false);
  const mounted = useRef(true);
  const runtime = useRef<BrowserMediaRuntime | null>(null);
  const urls = useRef(new Set<string>());
  const [queue] = useState(() => new SerialQueue<File[], StoredResult>(20, () => { if (mounted.current) redraw(n => n + 1); }));
  useEffect(() => {
    mounted.current = true;
    if (initialFiles.length && !queue.items.length) add(initialFiles);
    return () => { mounted.current = false; queue.stop(); runtime.current?.terminate(); for (const url of urls.current) URL.revokeObjectURL(url); urls.current.clear(); };
  }, [queue, initialFiles, group]);

  function add(files: File[]) {
    setMessage('');
    if (!files.length) return;
    if (queue.items.flatMap(i => i.input).concat(files).reduce((n, f) => n + f.size, 0) > 500 * 1024 * 1024) { setMessage('The queue may hold up to 500 MB of source files. Remove finished tasks first.'); return; }
    if (group && (files.length < 2 || files.length > 10)) { setMessage('Each merge task needs 2–10 clips.'); return; }
    try { queue.add(group ? [files] : files.map(file => [file])); } catch (error) { setMessage((error as Error).message); }
  }

  async function start() {
    setStopping(false);
    await queue.start(async (files, id) => {
      setProgress(undefined);
      const output = await process(files, setProgress, r => { runtime.current = r; }, () => !mounted.current);
      if (!mounted.current) throw new Error('The workspace was closed.');
      if (queue.items.reduce((n, item) => n + (item.result?.bytes ?? 0), 0) + output.blob.size > 500 * 1024 * 1024) throw new Error('Saved results reached the 500 MB browser limit. Download and remove completed tasks before continuing.');
      const url = URL.createObjectURL(output.blob);
      urls.current.add(url);
      const stem = files[0].name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 100);
      return { url, name: `${id}-${stem}-${output.name}`, bytes: output.blob.size };
    });
  }

  return <section className="batch-workspace" aria-label="Batch processing" onDragOver={e => { e.preventDefault(); }} onDrop={e => { e.preventDefault(); add(Array.from(e.dataTransfer.files)); }}>
    <h3>Batch processing</h3>
    <p>Tasks run one at a time in this tab. Keep this page open. {cloud ? 'Each successful image uses 1 AI credit. Stop finishes the current paid task.' : 'Files stay on your device.'}</p>
    <label className="local-file-picker"><strong>{group ? 'Add a merge task · choose 2–10 clips' : 'Add files or drag them here'}</strong><input type="file" accept={accept} multiple onChange={e => { add(Array.from(e.target.files ?? [])); e.target.value = ''; }} /></label>
    <fieldset disabled={queue.running} className="batch-settings"><legend>Settings for queued tasks</legend>{settings}</fieldset>
    {message ? <p role="alert" className="error-message">{message}</p> : null}
    <div className="local-media-actions">
      <button className="button button-primary" disabled={!ready || queue.running || !queue.items.some(i => i.status === 'queued')} onClick={start}>Start queue</button>
      {queue.running ? <button className="button button-ghost" disabled={stopping} onClick={() => { queue.stop(); setStopping(true); }}>Stop after current</button> : <button className="button button-ghost" onClick={onClose}>Back to single file</button>}
    </div>
    {stopping && queue.running ? <p role="status">Finishing the current task. Remaining files will stay queued.</p> : null}
    <ol className="batch-list">{queue.items.map(item => <li key={item.id} data-status={item.status}>
      <div className="batch-item-title"><strong>{item.input.map(f => f.name).join(' + ')}</strong><span aria-live="polite">{item.status}</span></div>
      {item.status === 'processing' ? <ProcessingOverlay inline label="Processing queued file…" progress={cloud ? undefined : progress} /> : null}
      {item.error ? <p role="alert" className="error-message">{item.error}{cloud ? ' Check your account history before resubmitting an interrupted AI task.' : ''}</p> : null}
      {item.result ? <a className="button button-primary" href={item.result.url} download={item.result.name}>Download {item.result.name} · {(item.result.bytes / 1024).toFixed(1)} KB</a> : null}
      <button className="button button-ghost" disabled={item.status === 'processing'} onClick={() => { if (item.result) { URL.revokeObjectURL(item.result.url); urls.current.delete(item.result.url); } queue.remove(item.id); }}>Remove task {item.id}</button>
    </li>)}</ol>
  </section>;
}
