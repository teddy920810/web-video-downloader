import { useState } from 'react';
import BatchWorkspace from './BatchWorkspace';
import TargetSizeField from './TargetSizeField';
import { processLocalVideo, type VideoMode, type VideoOptions } from './batch-processors';
import { targetBytes } from '../../lib/media/target-size';

export default function VideoBatchWorkspace({ files, mode, onClose, initial = {} }: { files: File[]; mode: VideoMode; onClose: () => void; initial?: VideoOptions }) {
  const [options, setOptions] = useState<VideoOptions>(initial);
  const [size, setSize] = useState('');
  const [unit, setUnit] = useState<'KB' | 'MB'>('MB');
  const set = (patch: Partial<VideoOptions>) => setOptions(old => ({ ...old, ...patch }));
  return <section className="local-media-tool" data-workspace="true"><BatchWorkspace toolId={mode === 'audio' ? 'audio-extractor' : mode === 'gif' ? 'video-to-gif' : `video-${mode}`} initialFiles={files} accept="video/*" group={mode === 'merger'} onClose={onClose}
    settings={<>
      {mode === 'converter' ? <label className="local-media-field">Output format<select value={options.target ?? 'mp4'} onChange={e => set({ target: e.target.value as VideoOptions['target'] })}><option value="mp4">MP4</option><option value="webm">WebM</option><option value="mp3">MP3</option></select></label> : null}
      {mode === 'compressor' ? <><label className="local-media-field">Compression level<select value={options.preset ?? 'balanced'} onChange={e => set({ preset: e.target.value as VideoOptions['preset'] })}><option value="small">Small</option><option value="balanced">Balanced</option><option value="quality">Quality</option></select></label><TargetSizeField value={size} unit={unit} onValue={setSize} onUnit={setUnit} /><p>Target applies to each video. Target mode may lower resolution and quality; it never cuts the video short.</p></> : null}
      {mode === 'audio' ? <label className="local-media-field">Audio format<select value={options.audio ?? 'mp3'} onChange={e => set({ audio: e.target.value as VideoOptions['audio'] })}><option value="mp3">MP3</option><option value="wav">WAV</option></select></label> : null}
      {mode === 'trimmer' || mode === 'gif' ? <label className="local-media-field">Start · seconds<input type="number" min="0" step="0.1" value={options.start ?? 0} onChange={e => set({ start: Number(e.target.value) })} /></label> : null}
      {mode === 'trimmer' ? <label className="local-media-field">End · seconds<input type="number" min="0.1" step="0.1" value={options.end ?? 10} onChange={e => set({ end: Number(e.target.value) })} /></label> : null}
      {mode === 'gif' ? <><label className="local-media-field">Duration · seconds<input type="number" min="1" max="30" value={options.duration ?? 5} onChange={e => set({ duration: Number(e.target.value) })} /></label><label className="local-media-field">GIF width<select value={options.width ?? 640} onChange={e => set({ width: Number(e.target.value) })}><option value="480">480 px</option><option value="640">640 px</option><option value="960">960 px</option></select></label></> : null}
    </>}
    process={(selected, progress, runtime, cancelled) => processLocalVideo(selected, mode, { ...options, ...(mode === 'compressor' && size ? { targetBytes: targetBytes(size, unit) } : {}) }, { progress, runtime, cancelled })} /></section>;
}
