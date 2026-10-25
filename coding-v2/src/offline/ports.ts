import type { CachePort, FetchPort, InstalledRecord, LedgerPort, OfflineManifest, Ports } from './types';

export const CACHE_NAME = 'coding-v2-offline-files';
/** Banco próprio e separado: nunca é o dos documentos (`coding-v2-documents`) nem o do Coding 1.0. */
export const LEDGER_DB = 'coding-v2-offline';
const STORE = 'records';

export function browserCache(): CachePort {
  const open = (): Promise<Cache> => caches.open(CACHE_NAME);
  return {
    async keys() { const c = await open(); return (await c.keys()).map((r) => new URL(r.url).pathname); },
    async put(path, body, contentType) { const c = await open(); await c.put(path, new Response(body, { status: 200, headers: { 'content-type': contentType, 'content-length': String(body.size) } })); },
    async remove(path) { const c = await open(); await c.delete(path); }
  };
}

function openLedger(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LEDGER_DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Banco offline indisponível.'));
  });
}
function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openLedger().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Falha no banco offline.')); };
  }));
}
export function browserLedger(): LedgerPort {
  return {
    all: () => run<InstalledRecord[]>('readonly', (s) => s.getAll() as IDBRequest<InstalledRecord[]>),
    put: async (r) => { await run('readwrite', (s) => s.put(r)); },
    remove: async (id) => { await run('readwrite', (s) => s.delete(id)); }
  };
}

const networkFetch: FetchPort = (path, signal) => fetch(path, { cache: 'reload', signal, credentials: 'same-origin' });

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function browserPorts(): Ports {
  return { cache: browserCache(), ledger: browserLedger(), fetch: networkFetch, sha256: typeof crypto !== 'undefined' && crypto.subtle ? sha256Hex : undefined };
}

/** Manifesto do build atual (sempre da rede; nunca de cache). */
export async function fetchManifest(signal?: AbortSignal): Promise<OfflineManifest> {
  const res = await fetch('/offline-manifest.json', { cache: 'no-store', signal });
  if (!res.ok) throw new Error('manifesto ' + res.status);
  const data = (await res.json()) as OfflineManifest;
  if (data?.schema !== 1 || !data.core || !data.apps) throw new Error('manifesto inválido');
  return data;
}
