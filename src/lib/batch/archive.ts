import { Zip, ZipPassThrough } from 'fflate';

type Entry = { name: string; blob: Blob };
export const MAX_ARCHIVE_BYTES = 250 * 1024 * 1024;

/** Store already-compressed media in a ZIP, reading bounded chunks and yielding to the UI. */
export async function createResultArchive(entries: Entry[], options: {
  maxBytes?: number; signal?: AbortSignal; progress?: (percent: number) => void;
} = {}): Promise<Blob> {
  if (!entries.length) throw new Error('Select at least one completed file.');
  const total = entries.reduce((n, entry) => n + entry.blob.size, 0);
  if (total > (options.maxBytes ?? MAX_ARCHIVE_BYTES)) throw new Error('Choose a smaller selection: each ZIP can contain up to 250 MB. Individual downloads remain available.');
  const chunks: BlobPart[] = [];
  let failure: Error | undefined;
  const zip = new Zip((error, data) => { if (error) failure = error; else chunks.push(new Uint8Array(data)); });
  const names = new Set<string>();
  let consumed = 0;
  const check = () => { if (options.signal?.aborted) throw new Error('Packing cancelled. Your results are still available.'); if (failure) throw failure; };
  try {
    for (const entry of entries) {
      check();
      const leaf = entry.name.split(/[\\/]/).pop() || 'result';
      const base = Array.from(leaf, char => char.charCodeAt(0) < 32 || ':*?"<>|'.includes(char) ? '_' : char).join('').replace(/^\.+/, '') || 'result';
      let name = base;
      for (let n = 2; names.has(name.toLowerCase()); n++) {
        const dot = base.lastIndexOf('.');
        name = dot > 0 ? `${base.slice(0, dot)} (${n})${base.slice(dot)}` : `${base} (${n})`;
      }
      names.add(name.toLowerCase());
      const stream = new ZipPassThrough(name); zip.add(stream);
      for (let offset = 0; offset < entry.blob.size; offset += 256 * 1024) {
        check();
        const bytes = new Uint8Array(await entry.blob.slice(offset, offset + 256 * 1024).arrayBuffer());
        stream.push(bytes); consumed += bytes.length;
        options.progress?.(total ? consumed / total * 100 : 100);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      stream.push(new Uint8Array(), true);
    }
    check(); zip.end(); check();
    return new Blob(chunks, { type: 'application/zip' });
  } catch (error) { zip.terminate(); throw error; }
}
