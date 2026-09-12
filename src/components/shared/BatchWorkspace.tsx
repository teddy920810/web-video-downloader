import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SerialQueue } from '../../lib/batch/serial-queue';
import { runTrackedTask } from '../../lib/batch/tracked-task';
import ProcessingOverlay from './ProcessingOverlay';
import MediaPreview from './MediaPreview';
import ColorSwatches from './ColorSwatches';
import { composeBackground } from '../../lib/image/background-export';
import type { BatchResult } from './batch-processors';
import type { BrowserMediaRuntime } from '../../lib/media/ffmpeg-runtime';

type StoredResult = BatchResult & { url: string; bytes: number; color?: string };
const EMPTY_FILES: File[] = [];
const LIMIT = 500 * 1024 * 1024;
const sizeLabel = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
const labels = { queued: 'Waiting', processing: 'Processing', ready: 'Complete', failed: 'Failed' };
type Props = {
  initialFiles?: File[]; accept: string; group?: boolean; cloud?: boolean; settings?: ReactNode; toolId: string;
  process: (files: File[], progress: (n: number) => void, runtime: (r: BrowserMediaRuntime | null) => void, cancelled: () => boolean) => Promise<BatchResult>;
  onClose: () => void; ready?: boolean; beforeStart?: (count: number) => Promise<void>;
  background?: string; creditBalance?: number | null;
};

export default function BatchWorkspace({ initialFiles = EMPTY_FILES, accept, group, cloud, settings, process, onClose, ready = true, beforeStart, background, creditBalance, toolId }: Props) {
  const [, redraw] = useState(0);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState<number>();
  const [stopping, setStopping] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [activeId, setActiveId] = useState<number>();
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [view, setView] = useState<'original' | 'result'>('result');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [packing, setPacking] = useState(false);
  const [packProgress, setPackProgress] = useState(0);
  const [recoloring, setRecoloring] = useState(false);
  const mounted = useRef(true);
  const runtime = useRef<BrowserMediaRuntime | null>(null);
  const urls = useRef(new Set<string>());
  const sources = useRef(new Map<File, string>());
  const archiveController = useRef<AbortController | null>(null);
  const operation = useRef(false);
  const [queue] = useState(() => new SerialQueue<File[], StoredResult>(20, () => { if (mounted.current) redraw(n => n + 1); }));
  const makeUrl = (blob: Blob) => { const url = URL.createObjectURL(blob); urls.current.add(url); return url; };
  const revoke = (url: string) => { URL.revokeObjectURL(url); urls.current.delete(url); };
  useEffect(() => {
    mounted.current = true;
    if (initialFiles.length && !queue.items.length) add(initialFiles);
    return () => {
      mounted.current = false; queue.stop(); runtime.current?.terminate(); archiveController.current?.abort();
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current.clear(); sources.current.clear();
    };
  }, [queue, initialFiles, group]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (queue.items.length) event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [queue]);

  function add(files: File[]) {
    if (preparing && !queue.running) return;
    setMessage('');
    if (!files.length) return;
    if (queue.items.flatMap(i => i.input).concat(files).reduce((n, f) => n + f.size, 0) > LIMIT) { setMessage('The queue may hold up to 500 MB of source files. Download and remove finished tasks first.'); return; }
    if (group && (files.length < 2 || files.length > 10)) { setMessage('Each merge task needs 2–10 clips.'); return; }
    try {
      queue.add(group ? [files] : files.map(file => [file]));
      for (const file of files) if (!sources.current.has(file)) sources.current.set(file, makeUrl(file));
      setActiveId(id => id ?? queue.items[0]?.id);
      if (queue.running) setMessage('Added to the waiting list. These files need another click on Start queue.');
    } catch (error) { setMessage((error as Error).message); }
  }

  async function start() {
    if (queue.running || preparing || operation.current) return;
    setMessage(''); setPreparing(true); setStopping(false);
    // This render's process/options are the settings snapshot for the whole run.
    const run = process;
    const runBackground = background;
    try {
      await beforeStart?.(queue.items.filter(i => i.status === 'queued').length);
      if (!mounted.current) return;
      await queue.start((files, id) => runTrackedTask(toolId, Boolean(cloud), async () => {
        setProgress(undefined);
        const output = await run(files, setProgress, r => { runtime.current = r; }, () => !mounted.current);
        if (!mounted.current) throw new Error('The workspace was closed.');
        const blob = output.rawBlob && runBackground ? await composeBackground(output.rawBlob, runBackground) : output.blob;
        if (!mounted.current) throw new Error('The workspace was closed.');
        const retained = queue.items.reduce((n, item) => n + (item.result?.bytes ?? 0) + (item.result?.rawBlob?.size ?? 0), 0);
        if (retained + blob.size + (output.rawBlob?.size ?? 0) > LIMIT) throw new Error('Saved results reached the 500 MB browser limit. Download and remove completed tasks before continuing.');
        const stem = files[0].name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 100);
        setSelected(old => new Set([...old, id]));
        return { ...output, blob, url: makeUrl(blob), name: `${id}-${stem}-${output.name}`, bytes: blob.size, color: runBackground };
      }));
    } catch (error) { if (mounted.current) setMessage((error as Error).message); }
    finally { if (mounted.current) setPreparing(false); }
  }

  function remove(id: number) {
    const item = queue.items.find(i => i.id === id);
    if (!item || item.status === 'processing' || operation.current) return;
    if (item.result && !window.confirm('Remove this result? Download it first if you want to keep it.')) return;
    if (item.result) revoke(item.result.url);
    queue.remove(id);
    for (const file of item.input) if (!queue.items.some(i => i.input.includes(file))) {
      const url = sources.current.get(file); if (url) revoke(url); sources.current.delete(file);
    }
    setSelected(old => { const next = new Set(old); next.delete(id); return next; });
    if (activeId === id) setActiveId(queue.items[0]?.id);
  }

  async function pack(all = false) {
    if (operation.current) return;
    const entries = queue.items.filter(i => i.result && (all || selected.has(i.id))).map(i => i.result!);
    operation.current = true; setPacking(true); setPackProgress(0); setMessage('');
    const controller = new AbortController(); archiveController.current = controller;
    try {
      const { createResultArchive } = await import('../../lib/batch/archive');
      const blob = await createResultArchive(entries, { signal: controller.signal, progress: setPackProgress });
      if (!mounted.current) return;
      const url = makeUrl(blob);
      const link = document.createElement('a'); link.href = url; link.download = 'streamnest-results.zip';
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => revoke(url), 60_000);
      setMessage('ZIP download started. Check your browser downloads to confirm it was saved.');
    } catch (error) { if (mounted.current) setMessage((error as Error).message); }
    finally { operation.current = false; if (mounted.current) setPacking(false); archiveController.current = null; }
  }

  async function recolor(color: string, all = false) {
    if (operation.current || queue.running) return;
    const targets = queue.items.filter(i => i.result?.rawBlob && (all || i.id === activeId));
    operation.current = true; setRecoloring(true); setMessage('');
    try {
      for (const item of targets) {
        const output = item.result!;
        const blob = await composeBackground(output.rawBlob!, color);
        if (!mounted.current) return;
        const retained = queue.items.reduce((n, i) => n + (i.result?.bytes ?? 0) + (i.result?.rawBlob?.size ?? 0), 0);
        if (retained - output.bytes + blob.size > LIMIT) throw new Error('Result memory is full. Download and remove some results first.');
        const url = makeUrl(blob); revoke(output.url);
        item.result = { ...output, blob, url, bytes: blob.size, color };
        redraw(n => n + 1);
      }
    } catch (error) { if (mounted.current) setMessage((error as Error).message); }
    finally { operation.current = false; if (mounted.current) setRecoloring(false); }
  }

  const completed = queue.items.filter(i => i.result);
  const pending = queue.items.filter(i => i.status === 'queued').length;
  const failed = queue.items.filter(i => i.status === 'failed').length;
  const selection = completed.filter(i => selected.has(i.id));
  const active = queue.items.find(i => i.id === activeId) ?? queue.items[0];
  const output = active?.result;
  const showResult = view === 'result' && output;
  const source = previewFile && active?.input.includes(previewFile) ? previewFile : active?.input[0];
  const previewBlob = showResult ? output.blob : source;
  const previewUrl = showResult ? output.url : source && sources.current.get(source);
  const singleMerge = group && queue.items.length <= 1;
  const workspaceLabel = singleMerge ? 'Merge video clips' : 'Batch processing';

  return <section className="batch-workspace" aria-label={workspaceLabel} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); add(Array.from(e.dataTransfer.files)); }}>
    <div className="batch-heading"><div><h3>{workspaceLabel}</h3><p aria-live="polite">{completed.length} of {queue.items.length} complete{failed ? ` · ${failed} failed` : ''}{pending ? ` · ${pending} waiting` : ''}</p></div>
      <label className={`local-file-picker ${queue.items.length ? 'batch-add' : ''}`}><strong>{group ? 'Add a merge task · choose 2–10 clips' : 'Add files or drag them here'}</strong><input type="file" accept={accept} multiple disabled={preparing && !queue.running} onChange={e => { add(Array.from(e.target.files ?? [])); e.target.value = ''; }} /></label>
    </div>
    <p className="batch-help">Tasks run one at a time in this tab. Keep this page open. {cloud ? `Each successful image uses 1 AI credit.${creditBalance == null ? '' : ` ${creditBalance} credits available.`} Stop finishes the current paid task.` : 'Files stay on your device.'} New files added during processing wait for your next start.</p>
    <div className="batch-workspace-grid">
      <div className="batch-files"><div className="batch-selection"><label><input type="checkbox" aria-label="Select all completed" checked={completed.length > 0 && selection.length === completed.length} disabled={!completed.length || packing} onChange={e => setSelected(e.target.checked ? new Set(completed.map(i => i.id)) : new Set())} />Select completed</label></div>
        <ol className="batch-list">{queue.items.map(item => <li key={item.id} data-status={item.status} data-active={item.id === active?.id}>
          <div className="batch-file-heading"><input type="checkbox" aria-label={`Select result ${item.id}`} checked={selected.has(item.id) && Boolean(item.result)} disabled={!item.result || packing} onChange={e => setSelected(old => { const next = new Set(old); if (e.target.checked) next.add(item.id); else next.delete(item.id); return next; })} />
            <button type="button" className="batch-file-open" onClick={() => { setActiveId(item.id); setView('result'); }} aria-label={`Preview task ${item.id}`}>
              {item.input[0].type.startsWith('image/') && item.input[0].type !== 'image/svg+xml' ? <img src={item.result?.url ?? sources.current.get(item.input[0])} alt="" loading="lazy" /> : <span className="batch-file-icon" aria-hidden="true">{group ? '▤' : item.input[0].type.startsWith('video/') ? '▶' : '▧'}</span>}
              <span><strong title={item.input.map(f => f.name).join(' + ')}>{group ? `Merge ${item.id} · ${item.input.length} clips` : item.input[0].name}</strong><small>{sizeLabel(item.input.reduce((n, f) => n + f.size, 0))}</small></span>
            </button></div>
          <div className="batch-item-title"><span className={`batch-status status-${item.status}`}>{labels[item.status]}</span>{item.result ? <small>{sizeLabel(item.result.bytes)}</small> : null}</div>
          {item.error ? <p role="alert" className="error-message">{item.error}{cloud ? ' Check your account history before resubmitting an interrupted AI task.' : ''}</p> : null}
          <div className="batch-row-actions">{item.result ? <a className="button button-primary" aria-disabled={recoloring} href={recoloring ? undefined : item.result.url} download={item.result.name}>Download</a> : null}
            <button className="button button-ghost" disabled={item.status === 'processing' || packing || recoloring} onClick={() => remove(item.id)} aria-label={`Remove task ${item.id}`}>Remove</button></div>
        </li>)}</ol>
      </div>
      <div className="batch-preview"><div className="batch-preview-toolbar"><strong>{active ? `Preview · task ${active.id}` : 'Preview'}</strong>{output ? <div><button type="button" aria-pressed={view === 'original'} onClick={() => setView('original')}>Original</button><button type="button" aria-pressed={view === 'result'} onClick={() => setView('result')}>Result</button></div> : null}</div>
        <div className="batch-preview-canvas checkerboard">{previewBlob && previewUrl ? <MediaPreview blob={previewBlob} url={previewUrl} name={showResult ? 'Processed result' : 'Original file'} /> : <p>Add files to preview and process them.</p>}
          {active?.status === 'processing' || recoloring ? <ProcessingOverlay label={recoloring ? 'Updating background…' : 'Processing file…'} progress={cloud || recoloring ? undefined : progress} /> : null}
        </div>
        {output && source ? <p className="batch-result-meta">{sizeLabel(active.input.reduce((n, f) => n + f.size, 0))} → {sizeLabel(output.bytes)} · {output.blob.type}{!group && output.bytes < source.size ? ` · ${Math.round((1 - output.bytes / source.size) * 100)}% smaller` : ''}</p> : null}
        {group && active ? <ol className="batch-clips">{active.input.map((file, index) => <li key={index}>
          <button type="button" className="batch-clip-name" onClick={() => { setPreviewFile(file); setView('original'); }}>{index + 1}. {file.name}</button>
          <button type="button" disabled={queue.running || active.status !== 'queued' || index === 0} aria-label={`Move clip ${index + 1} up`} onClick={() => { const files = [...active.input]; [files[index - 1], files[index]] = [files[index], files[index - 1]]; active.input = files; redraw(n => n + 1); }}>↑</button>
          <button type="button" disabled={queue.running || active.status !== 'queued' || index === active.input.length - 1} aria-label={`Move clip ${index + 1} down`} onClick={() => { const files = [...active.input]; [files[index], files[index + 1]] = [files[index + 1], files[index]]; active.input = files; redraw(n => n + 1); }}>↓</button>
          <button type="button" disabled={queue.running || active.status !== 'queued' || active.input.length <= 2} aria-label={`Remove clip ${index + 1}`} onClick={() => {
            active.input = active.input.filter((_, i) => i !== index);
            if (!queue.items.some(i => i.input.includes(file))) { const url = sources.current.get(file); if (url) revoke(url); sources.current.delete(file); }
            if (previewFile === file) setPreviewFile(null); redraw(n => n + 1);
          }}>×</button>
        </li>)}</ol> : null}
      </div>
      <aside className="batch-options"><fieldset disabled={queue.running || preparing || packing} className="batch-settings"><legend>Settings for queued tasks</legend>{settings}</fieldset>
        {output?.rawBlob ? <div className="batch-result-colors"><ColorSwatches label="Result background" value={output.color ?? 'transparent'} disabled={queue.running || recoloring || packing} onChange={color => void recolor(color)} /><p>Changes this result only. No additional AI credits.</p><button className="button button-ghost" disabled={queue.running || recoloring || packing} onClick={() => void recolor(output.color ?? 'transparent', true)}>Apply to all completed</button></div> : null}
      </aside>
    </div>
    {message ? <p role="status" className="batch-message">{message}</p> : null}
    <div className="batch-action-bar"><div><button className="button button-primary" disabled={!ready || preparing || queue.running || !pending || packing || recoloring} onClick={start}>{singleMerge ? 'Merge locally' : 'Start queue'}</button><span>{pending} {group ? 'merge tasks' : 'files'}{cloud ? ` · ${pending} AI credits` : ''}</span>
      {queue.running ? <button className="button button-ghost" disabled={stopping} onClick={() => { queue.stop(); setStopping(true); }}>Stop after current</button> : <button className="button button-ghost" disabled={packing || recoloring || preparing} onClick={() => { if (!queue.items.length || window.confirm('Leave this workspace? Files and results in this tab will be discarded. Download what you need first.')) onClose(); }}>Choose other files</button>}</div>
      <div><span>{selection.length} selected · {sizeLabel(selection.reduce((n, i) => n + i.result!.bytes, 0))}</span><button className="button button-primary" disabled={!selection.length || packing || recoloring} onClick={() => void pack()}>Download selected · ZIP</button><button className="button button-ghost" disabled={!completed.length || packing || recoloring} onClick={() => void pack(true)}>Download all · ZIP</button></div>
    </div>
    {packing ? <div role="status" className="batch-pack-progress"><progress value={packProgress} max={100} /> Packing {Math.round(packProgress)}%<button type="button" className="button button-ghost" onClick={() => archiveController.current?.abort()}>Cancel packing</button></div> : null}
    {stopping && queue.running ? <p role="status">Finishing the current task. Remaining files will stay queued.</p> : null}
  </section>;
}
