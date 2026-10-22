import { getCopy } from '../storage/documents';
import { LruCache, TaskQueue } from './cache';
import { buildPreview, previewable, type Preview } from './model';

const cache = new LruCache<Preview>(80);
const inflight = new Map<string, Promise<Preview>>();
const queue = new TaskQueue(2);
export interface PreviewKey { id: string; revision: number; type?: string }
const keyOf = (c: PreviewKey): string => c.id + ':' + c.revision;

export function cachedPreview(c: PreviewKey): Preview | undefined { return cache.get(keyOf(c)); }

/** Carrega a prévia a partir do documento salvo (somente leitura). Nunca cria banco nem registro. */
export function loadPreview(c: PreviewKey): Promise<Preview> {
  if (!previewable(c.type)) return Promise.reject(new Error('Tipo sem prévia'));
  const key = keyOf(c);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(key);
  if (pending) return pending;
  const job = queue.run(async () => {
    const record = await getCopy(c.id);
    if (!record) throw new Error('Documento ausente');
    const preview = buildPreview(record.snapshot.doc.type ?? c.type, record.snapshot.doc.state);
    cache.set(key, preview);
    return preview;
  }).finally(() => { inflight.delete(key); });
  inflight.set(key, job);
  return job;
}
export function clearPreviewCache(): void { cache.clear(); inflight.clear(); }
