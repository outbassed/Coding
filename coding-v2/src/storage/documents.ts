/**
 * Coding 2.0 Phase 3: safe, opt-in bridge to legacy documents.
 *
 * Legacy "coding-db" is NEVER upgraded, written, or deleted by this module.
 * New copies live in a separate database and retain the original raw object + Blob images.
 * No editor engine is connected to these copies yet.
 */
export const LEGACY_DB_NAME = 'coding-db';
export const COPIES_DB_NAME = 'coding-v2-documents';
const COPIES_VERSION = 1;
const LEGACY_LIBRARY_KEY = 'coding-library-v1';

export type Source = 'indexeddb' | 'localStorage' | 'backup';
export interface LegacyDoc {
  id: string;
  type?: string;
  updatedAt?: number;
  state?: { name?: string; [key: string]: unknown };
  [key: string]: unknown;
}
export interface LegacyImage {
  id: string;
  docId: string;
  blob?: Blob;
  [key: string]: unknown;
}
export interface LegacySnapshot {
  source: Source;
  doc: LegacyDoc;
  images: LegacyImage[];
}
export interface CopyRecord {
  id: string;
  legacyId: string;
  source: Source;
  label: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  snapshot: LegacySnapshot;
}
export interface LegacyInspection {
  snapshots: LegacySnapshot[];
  notes: string[];
}
export class RevisionConflict extends Error {
  constructor() { super('Este documento foi alterado em outra janela. Recarregue ou salve uma nova cópia.'); this.name = 'RevisionConflict'; }
}
export class MissingCopy extends Error {
  constructor() { super('A cópia não foi encontrada neste aparelho.'); this.name = 'MissingCopy'; }
}

const requestResult = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('Falha no IndexedDB'));
});
const committed = (tx: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onabort = () => reject(tx.error ?? new Error('Transação cancelada'));
  tx.onerror = () => reject(tx.error ?? new Error('Falha ao gravar'));
});
const validDoc = (value: unknown): value is LegacyDoc => {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && typeof (value as LegacyDoc).id === 'string' && (value as LegacyDoc).id.length > 0;
};
const newId = () => crypto.randomUUID();

async function legacyDatabaseNames(): Promise<string[] | null> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return null;
  const names = await indexedDB.databases();
  return names.map((item) => item.name).filter((name): name is string => typeof name === 'string');
}

async function readLegacyIdb(): Promise<LegacySnapshot[]> {
  // Calling open() on an unknown name would CREATE a database. Never do that.
  const names = await legacyDatabaseNames();
  if (!names?.includes(LEGACY_DB_NAME)) return [];
  const req = indexedDB.open(LEGACY_DB_NAME); // no version: read the existing schema unchanged
  req.onupgradeneeded = () => { req.transaction?.abort(); };
  const db = await requestResult(req);
  db.onversionchange = () => db.close();
  try {
    if (!db.objectStoreNames.contains('docs') || !db.objectStoreNames.contains('images')) {
      throw new Error('O banco antigo não possui a estrutura esperada. Nada foi alterado.');
    }
    const tx = db.transaction(['docs', 'images'], 'readonly');
    const done = committed(tx);
    const docRequest = tx.objectStore('docs').getAll() as IDBRequest<LegacyDoc[]>;
    const imageRequest = tx.objectStore('images').getAll() as IDBRequest<LegacyImage[]>;
    const [docs, images] = await Promise.all([requestResult(docRequest), requestResult(imageRequest), done]);
    const groups = new Map<string, LegacyImage[]>();
    for (const image of images) {
      if (!image || typeof image.docId !== 'string') continue;
      const group = groups.get(image.docId) ?? [];
      group.push(image);
      groups.set(image.docId, group);
    }
    return docs.filter(validDoc).map((doc) => ({ source: 'indexeddb' as const, doc, images: groups.get(doc.id) ?? [] }));
  } finally { db.close(); }
}

function readLegacyLocalStorage(): LegacySnapshot[] {
  const raw = localStorage.getItem(LEGACY_LIBRARY_KEY);
  if (raw !== null) {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !('docs' in parsed)) throw new Error('Biblioteca antiga no localStorage inválida.');
    const docs = (parsed as { docs?: unknown }).docs;
    if (!docs || typeof docs !== 'object') throw new Error('Biblioteca antiga no localStorage inválida.');
    return Object.values(docs).filter(validDoc).map((doc) => ({ source: 'localStorage', doc, images: [] }));
  }
  const older = localStorage.getItem('coding-document-v2') ?? localStorage.getItem('coding-document-v1');
  if (older) {
    const state: unknown = JSON.parse(older);
    const doc: LegacyDoc = { id: 'legacy-single-document', type: 'labels', state: state as LegacyDoc['state'] };
    return [{ source: 'localStorage', doc, images: [] }];
  }
  return [];
}

/**
 * Explicit user action only. On a different origin/preview domain, the browser
 * cannot see the old site's IndexedDB, and this method correctly finds nothing.
 */
export async function inspectLegacy(): Promise<LegacyInspection> {
  const notes: string[] = [];
  let snapshots: LegacySnapshot[] = [];
  if (typeof indexedDB === 'undefined') notes.push('Este navegador não disponibiliza IndexedDB.');
  else if (typeof indexedDB.databases !== 'function') {
    notes.push('Este navegador não permite detectar com segurança se o banco antigo existe. Não foi aberto nem criado.');
  } else {
    try { snapshots = await readLegacyIdb(); }
    catch (err) { notes.push('Não foi possível ler o IndexedDB antigo: ' + errorText(err)); }
  }
  try { snapshots.push(...readLegacyLocalStorage()); }
  catch (err) { notes.push('Não foi possível ler o localStorage antigo: ' + errorText(err)); }
  if (snapshots.length === 0) notes.push('Nenhum documento encontrado nesta origem. Documentos de outro domínio ou instalação não são acessíveis automaticamente.');
  return { snapshots, notes };
}

export const documentName = (doc: LegacyDoc): string => {
  const stateName = doc.state && typeof doc.state.name === 'string' ? doc.state.name.trim() : '';
  const directName = typeof doc.name === 'string' ? doc.name.trim() : '';
  return (stateName || directName || 'Documento sem nome').slice(0, 250);
};

async function openCopies(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB indisponível neste navegador.');
  const req = indexedDB.open(COPIES_DB_NAME, COPIES_VERSION);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains('copies')) db.createObjectStore('copies', { keyPath: 'id' });
  };
  const db = await requestResult(req);
  db.onversionchange = () => db.close();
  return db;
}

/** Read all copies from our isolated database. Reading always waits for tx completion. */
export async function listCopies(): Promise<CopyRecord[]> {
  const db = await openCopies();
  try {
    const tx = db.transaction('copies', 'readonly');
    const done = committed(tx);
    const records = await requestResult(tx.objectStore('copies').getAll() as IDBRequest<CopyRecord[]>);
    await done;
    return records.sort((a, b) => b.updatedAt - a.updatedAt);
  } finally { db.close(); }
}

export async function getCopy(id: string): Promise<CopyRecord | undefined> {
  const db = await openCopies();
  try {
    const tx = db.transaction('copies', 'readonly');
    const done = committed(tx);
    const record = await requestResult(tx.objectStore('copies').get(id) as IDBRequest<CopyRecord | undefined>);
    await done;
    return record;
  } finally { db.close(); }
}

function notify(id: string): void {
  // Signals are advisory. The transaction's stored revision is the final authority.
  try { const channel = new BroadcastChannel('coding-v2-documents'); channel.postMessage({ type: 'copy-committed', id }); channel.close(); }
  catch { /* optional */ }
  window.dispatchEvent(new CustomEvent('coding-v2:copy-committed', { detail: id }));
}
export function watchCopies(callback: () => void): () => void {
  const onLocal = () => callback();
  window.addEventListener('coding-v2:copy-committed', onLocal);
  let channel: BroadcastChannel | null = null;
  try { channel = new BroadcastChannel('coding-v2-documents'); channel.onmessage = (evt: MessageEvent) => { if (evt.data?.type === 'copy-committed') callback(); }; }
  catch { /* optional */ }
  return () => { window.removeEventListener('coding-v2:copy-committed', onLocal); channel?.close(); };
}

/** Explicitly creates a fresh copy; no writes to the legacy database. */
export async function createCopy(snapshot: LegacySnapshot): Promise<CopyRecord> {
  if (!validDoc(snapshot.doc) || !Array.isArray(snapshot.images)) throw new Error('Documento inválido.');
  const now = Date.now();
  const record: CopyRecord = {
    id: newId(), legacyId: snapshot.doc.id, source: snapshot.source,
    label: documentName(snapshot.doc), revision: 1, createdAt: now, updatedAt: now,
    snapshot
  };
  const db = await openCopies();
  try {
    const tx = db.transaction('copies', 'readwrite');
    const done = committed(tx);
    tx.objectStore('copies').add(record);
    await done; // "saved" is only true AFTER oncomplete
  } finally { db.close(); }
  notify(record.id);
  return record;
}

/**
 * Compare-and-swap inside ONE IndexedDB readwrite transaction.
 * update may rename a copy or replace its entire snapshot in future editor engines.
 */
export async function saveCopyRevision(
  id: string, expectedRevision: number, changes: { label?: string; snapshot?: LegacySnapshot }
): Promise<CopyRecord> {
  if (changes.label !== undefined && (!changes.label.trim() || changes.label.length > 250)) throw new Error('Nome inválido.');
  if (changes.snapshot && (!validDoc(changes.snapshot.doc) || !Array.isArray(changes.snapshot.images))) throw new Error('Dados inválidos.');
  const db = await openCopies();
  let conflict = false;
  let missing = false;
  let updated: CopyRecord | undefined;
  try {
    const tx = db.transaction('copies', 'readwrite');
    const done = committed(tx);
    const read = tx.objectStore('copies').get(id) as IDBRequest<CopyRecord | undefined>;
    read.onsuccess = () => {
      const current = read.result;
      if (!current) { missing = true; tx.abort(); return; }
      if (current.revision !== expectedRevision) { conflict = true; tx.abort(); return; }
      updated = {
        ...current, label: changes.label?.trim() ?? current.label,
        snapshot: changes.snapshot ?? current.snapshot,
        revision: current.revision + 1, updatedAt: Date.now()
      };
      tx.objectStore('copies').put(updated);
    };
    try { await done; }
    catch (err) {
      if (conflict) throw new RevisionConflict();
      if (missing) throw new MissingCopy();
      throw err;
    }
  } finally { db.close(); }
  if (!updated) throw new Error('Gravação não confirmada.');
  notify(id);
  return updated;
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
