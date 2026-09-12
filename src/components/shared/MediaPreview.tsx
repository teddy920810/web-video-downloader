import { useEffect, useState } from 'react';

export default function MediaPreview({ blob, url, name }: { blob: Blob; url: string; name: string }) {
  const [error, setError] = useState(false);
  const [meta, setMeta] = useState('');
  useEffect(() => { setError(false); setMeta(''); }, [url]);
  const duration = (element: HTMLMediaElement) => setMeta(Number.isFinite(element.duration) ? `${element.duration.toFixed(1)} seconds` : '');
  return <div className="batch-media-preview">
    {error ? <p>Preview unavailable in this browser. You can still try processing this file.</p>
      : blob.type.startsWith('image/') && blob.type !== 'image/svg+xml' ? <img src={url} alt={name} onError={() => setError(true)} onLoad={e => setMeta(`${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight} px`)} />
        : blob.type.startsWith('video/') ? <video key={url} controls playsInline preload="metadata" src={url} onError={() => setError(true)} onLoadedMetadata={e => duration(e.currentTarget)} />
          : blob.type.startsWith('audio/') ? <audio key={url} controls preload="metadata" src={url} onError={() => setError(true)} onLoadedMetadata={e => duration(e.currentTarget)} />
            : <p>{blob.type === 'image/svg+xml' ? 'SVG source · process to preview the safely rendered image.' : 'File preview is available after processing.'}</p>}
    {meta ? <p className="batch-preview-meta">{meta}</p> : null}
  </div>;
}
