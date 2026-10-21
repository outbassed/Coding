/**
 * Coding 2.0 Phase 3: safe, opt-in bridge to legacy documents.
 *
 * Legacy "coding-db" is NEVER upgraded, written, or deleted by this module.
 * New copies live in a separate database and retain the original raw object + Blob images.
 * No editor engine is connected to these copies yet.
 */
export const LEGACY_DB_NAME = 'coding-db';
export const COPIES_DB_NAME = 'coding-v2-documents';
const COPIES_VERSION = 2;
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
export class DuplicateCopy extends Error {
  constructor() { super('Este documento já possui uma cópia. Nenhuma duplicação foi realizada.'); this.name = 'DuplicateCopy'; }
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
  const keys = new Set<string>();
  for (const entry of snapshots) {
    const key = entry.doc.id;
    if (keys.has(key)) notes.push('Documento ' + key + ' aparece em mais de uma fonte. Verifique antes de criar cópias.');
    keys.add(key);
  }
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
    if (!db.objectStoreNames.contains('assets')) {
      db.createObjectStore('assets', { keyPath: 'key' }).createIndex('copyId', 'copyId');
    }
  };
  req.onblocked = () => { /* Existing v1 tabs need to close for schema v2; surface via timeout below. */ };
  const db = await Promise.race([
    requestResult(req),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Banco v2 bloqueado por outra aba. Feche outras abas e tente de novo.')), 8000))
  ]);
  db.onversionchange = () => db.close();
  return db;
}

/**
 * Blob storage is separate from metadata: renaming a copy does not rewrite images.
 * Pre-existing version-1 copies retain their embedded images until the first save;
 * they are hydrated transparently and safely converted on the next write.
 */
type AssetRecord = { key: string; copyId: string; image: LegacyImage };
const assetKey = (copyId: string, imageId: string) => JSON.stringify([copyId, imageId]);
const withoutEmbeddedImages = (copy: CopyRecord): CopyRecord => ({
  ...copy, snapshot: { ...copy.snapshot, images: [] }
});
const hydrate = (record: CopyRecord, assets: AssetRecord[]): CopyRecord => ({
  ...record,
  snapshot: { ...record.snapshot, images: record.snapshot.images?.length
    ? record.snapshot.images
    : assets.filter((a) => a.copyId === record.id).map((a) => a.image) }
});
export function validateSnapshot(value: unknown): asserts value is LegacySnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Documento incompleto.');
  const entry = value as LegacySnapshot;
  if (!['indexeddb', 'localStorage', 'backup'].includes(entry.source) || !validDoc(entry.doc) || !Array.isArray(entry.images)) throw new Error('Estrutura de documento inválida.');
  const seen = new Set<string>();
  for (const image of entry.images) {
    if (!image || typeof image !== 'object' || typeof image.id !== 'string' || !image.id || image.docId !== entry.doc.id || !(image.blob instanceof Blob)) throw new Error('Imagem inválida ou vinculada a outro documento.');
    if (seen.has(image.id)) throw new Error('O documento possui imagens com IDs duplicados.');
    seen.add(image.id);
  }
}
function validCopy(copy: CopyRecord): void {
  if (!copy || typeof copy.id !== 'string' || !copy.id || typeof copy.legacyId !== 'string' || !copy.legacyId
    || !Number.isSafeInteger(copy.revision) || copy.revision < 1 || typeof copy.label !== 'string' || !copy.label.trim()
    || copy.label.length > 250 || !Number.isFinite(copy.createdAt) || !Number.isFinite(copy.updatedAt)) throw new Error('Metadados de cópia inválidos.');
  validateSnapshot(copy.snapshot);
}
function queueAssets(store: IDBObjectStore, copyId: string, images: LegacyImage[]): void {
  for (const image of images) store.add({ key: assetKey(copyId, image.id), copyId, image } satisfies AssetRecord);
}

/** Two-store transaction also reads metadata and Blob records from a consistent point. */
export async function listCopies(): Promise<CopyRecord[]> {
  const db = await openCopies();
  try {
    const tx = db.transaction(['copies', 'assets'], 'readonly');
    const done = committed(tx);
    const records = requestResult(tx.objectStore('copies').getAll() as IDBRequest<CopyRecord[]>);
    const assets = requestResult(tx.objectStore('assets').getAll() as IDBRequest<AssetRecord[]>);
    const [docs, blobs] = await Promise.all([records, assets, done]);
    return docs.map((doc) => hydrate(doc, blobs)).sort((a, b) => b.updatedAt - a.updatedAt);
  } finally { db.close(); }
}

export async function getCopy(id: string): Promise<CopyRecord | undefined> {
  const db = await openCopies();
  try {
    const tx = db.transaction(['copies', 'assets'], 'readonly');
    const done = committed(tx);
    const record = requestResult(tx.objectStore('copies').get(id) as IDBRequest<CopyRecord | undefined>);
    const assets = requestResult(tx.objectStore('assets').index('copyId').getAll(IDBKeyRange.only(id)) as IDBRequest<AssetRecord[]>);
    const [copy, blobs] = await Promise.all([record, assets, done]);
    return copy ? hydrate(copy, blobs) : undefined;
  } finally { db.close(); }
}

/** Entire batch is a single readwrite transaction. No partial import on quota or validation failure. */
export async function importCopiesAtomic(records: readonly CopyRecord[]): Promise<number> {
  if (!records.length) return 0;
  const identities = new Set<string>();
  const ids = new Set<string>();
  for (const record of records) {
    validCopy(record);
    const identity = JSON.stringify([record.source, record.legacyId]);
    if (ids.has(record.id) || identities.has(identity)) throw new DuplicateCopy();
    ids.add(record.id); identities.add(identity);
  }
  const db = await openCopies();
  try {
    const tx = db.transaction(['copies', 'assets'], 'readwrite');
    const done = committed(tx);
    const store = tx.objectStore('copies');
    const assets = tx.objectStore('assets');
    // All preflight checks and writes occur while this transaction holds the store lock.
    const all = store.getAll() as IDBRequest<CopyRecord[]>;
    let duplicate = false;
    all.onsuccess = () => {
      const existingIds = new Set(all.result.map((copy) => copy.id));
      const existingSources = new Set(all.result.map((copy) => JSON.stringify([copy.source, copy.legacyId])));
      if (records.some((record) => existingIds.has(record.id) || existingSources.has(JSON.stringify([record.source, record.legacyId])))) {
        duplicate = true; tx.abort(); return;
      }
      for (const copy of records) {
        store.add(withoutEmbeddedImages(copy));
        queueAssets(assets, copy.id, copy.snapshot.images);
      }
    };
    try { await done; } catch (err) { if (duplicate) throw new DuplicateCopy(); throw err; }
  } finally { db.close(); }
  for (const record of records) notify(record.id);
  return records.length;
}

/** Creates a brand-new copy only if no copy from the same origin already exists. */
export async function createCopy(snapshot: LegacySnapshot): Promise<CopyRecord> {
  validateSnapshot(snapshot);
  const now = Date.now();
  const copy: CopyRecord = {
    id: newId(), legacyId: snapshot.doc.id, source: snapshot.source, label: documentName(snapshot.doc),
    revision: 1, createdAt: now, updatedAt: now, snapshot
  };
  await importCopiesAtomic([copy]);
  return copy;
}

/** Transactional revision update for the v2 only. Old legacy database never changes. */
export async function saveCopyRevision(
  id: string, expectedRevision: number, changes: { label?: string; snapshot?: LegacySnapshot }
): Promise<CopyRecord> {
  if (changes.label !== undefined && (!changes.label.trim() || changes.label.length > 250)) throw new Error('Nome inválido.');
  if (changes.snapshot) validateSnapshot(changes.snapshot);
  const db = await openCopies();
  let conflict = false;
  let missing = false;
  let updated: CopyRecord | undefined;
  try {
    const tx = db.transaction(['copies', 'assets'], 'readwrite');
    const done = committed(tx);
    const copies = tx.objectStore('copies');
    const assets = tx.objectStore('assets');
    const read = copies.get(id) as IDBRequest<CopyRecord | undefined>;
    read.onsuccess = () => {
      const current = read.result;
      if (!current) { missing = true; tx.abort(); return; }
      if (current.revision !== expectedRevision) { conflict = true; tx.abort(); return; }
      // Renaming a v1 record migrates embedded image blobs to the assets store.
      // Updating snapshot content is atomic with removal of its old blob records.
      const fromOld = current.snapshot.images ?? [];
      const images = changes.snapshot?.images ?? fromOld;
      const mustReplace = Boolean(changes.snapshot);
      const shouldMigrate = fromOld.length > 0;
      if (mustReplace || shouldMigrate) {
        const cursor = assets.index('copyId').openKeyCursor(IDBKeyRange.only(id));
        cursor.onsuccess = () => {
          const pointer = cursor.result;
          if (pointer) { assets.delete(pointer.primaryKey); pointer.continue(); }
        };
        queueAssets(assets, id, images);
      }
      updated = {
        ...current, label: changes.label?.trim() ?? current.label,
        snapshot: { ...(changes.snapshot ?? current.snapshot), images: [] },
        revision: current.revision + 1, updatedAt: Date.now()
      };
      copies.put(updated);
    };
    try { await done; } catch (err) {
      if (conflict) throw new RevisionConflict();
      if (missing) throw new MissingCopy();
      throw err;
    }
  } finally { db.close(); }
  if (!updated) throw new Error('Gravação não confirmada.');
  // Return hydrated state when needed; callers should not receive erased image lists.
  const saved = await getCopy(id);
  if (!saved) throw new MissingCopy();
  notify(id);
  return saved;
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
