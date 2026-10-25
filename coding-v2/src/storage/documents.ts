/**
 * Coding 2.0 Phase 3: safe, opt-in bridge to legacy documents.
 *
 * Legacy "coding-db" is NEVER upgraded, written, or deleted by this module.
 * New copies live in a separate database and retain the original raw object + Blob images.
 * No editor engine is connected to these copies yet.
 */
import { appKeyForType, canAdd, effectiveLimit, LimitReached, MAX_TIER } from '../workspace/limits';
import { forgetDocument, loadLimitSettings, loadRecommended } from '../workspace/prefs';

export const LEGACY_DB_NAME = 'coding-db';
export const COPIES_DB_NAME = 'coding-v2-documents';
const COPIES_VERSION = 2;
const LEGACY_LIBRARY_KEY = 'coding-library-v1';

/** v2 is the native origin; historical v2-labels-* records used backup and remain supported. */
export type Source = 'indexeddb' | 'localStorage' | 'backup' | 'v2';
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

async function readLegacyIdb(notes: string[]): Promise<LegacySnapshot[]> {
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
    const valid = docs.filter(validDoc);
    const skipped = docs.length - valid.length;
    if (skipped) notes.push(skipped + ' documento(s) sem ID válido foram ignorados no IndexedDB. Não considere o backup completo.');
    const docIds = new Set(valid.map((doc) => doc.id));
    let orphaned = 0;
    const groups = new Map<string, LegacyImage[]>();
    for (const image of images) {
      if (!image || typeof image.docId !== 'string' || !docIds.has(image.docId)) { orphaned++; continue; }
      const group = groups.get(image.docId) ?? [];
      group.push(image);
      groups.set(image.docId, group);
    }
    if (orphaned) notes.push(orphaned + ' imagem(ns) órfã(s) ou sem vínculo foram encontradas. Não fazem parte do backup desta versão.');
    return valid.map((doc) => ({ source: 'indexeddb' as const, doc, images: groups.get(doc.id) ?? [] }));
  } finally { db.close(); }
}

function readLegacyLocalStorage(notes: string[]): LegacySnapshot[] {
  const raw = localStorage.getItem(LEGACY_LIBRARY_KEY);
  if (raw !== null) {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !('docs' in parsed)) throw new Error('Biblioteca antiga no localStorage inválida.');
    const docs = (parsed as { docs?: unknown }).docs;
    if (!docs || typeof docs !== 'object') throw new Error('Biblioteca antiga no localStorage inválida.');
    const items = Object.values(docs);
    const valid = items.filter(validDoc);
    if (valid.length !== items.length) notes.push((items.length - valid.length) + ' documento(s) inválido(s) foram ignorados no localStorage. Verifique antes de fazer backup.');
    return valid.map((doc) => ({ source: 'localStorage', doc, images: [] }));
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
    try { snapshots = await readLegacyIdb(notes); }
    catch (err) { notes.push('Não foi possível ler o IndexedDB antigo: ' + errorText(err)); }
  }
  try { snapshots.push(...readLegacyLocalStorage(notes)); }
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
  // A timed-out open() can still resolve later; close its connection immediately.
  // Promise.race(requestResult, timeout) used to leak that late IDB connection.
  return new Promise<IDBDatabase>((resolve, reject) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      reject(new Error('Banco v2 bloqueado por outra aba. Feche outras abas e tente de novo.'));
    }, 8000);
    req.onsuccess = () => {
      if (finished) { req.result.close(); return; }
      finished = true;
      clearTimeout(timer);
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reject(req.error ?? new Error('Falha ao abrir IndexedDB v2'));
    };
    req.onblocked = () => { /* Wait up to 8 seconds for old tabs to close. */ };
  });
}

/**
 * Blob storage is separate from metadata: renaming a copy does not rewrite images.
 * Pre-existing version-1 copies retain their embedded images until the first save;
 * they are hydrated transparently and safely converted on the next write.
 */
type AssetRecord = { key: string; copyId: string; image: LegacyImage };
type StoredCopyRecord = CopyRecord & { assetCount?: number; assetBytes?: number };
export interface CopySummary {
  id: string;
  legacyId: string;
  source: Source;
  label: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  type?: string;
  imageCount: number;
  /** null for old v2 copies whose asset sizes were never indexed */
  imageBytes: number | null;
}
const assetKey = (copyId: string, imageId: string) => JSON.stringify([copyId, imageId]);
const withoutEmbeddedImages = (copy: CopyRecord): StoredCopyRecord => ({
  ...copy,
  assetCount: copy.snapshot.images.length,
  assetBytes: copy.snapshot.images.reduce((sum, image) => sum + (image.blob?.size ?? 0), 0),
  snapshot: { ...copy.snapshot, images: [] }
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
  if (!['indexeddb', 'localStorage', 'backup', 'v2'].includes(entry.source) || !validDoc(entry.doc) || !Array.isArray(entry.images)) throw new Error('Estrutura de documento inválida.');
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

/**
 * Metadata-only listing for large libraries: never reads image Blob values.
 * Existing pre-index copies have exact image counts via asset keys and unknown byte totals.
 * Consumers must call getCopy(id) when they genuinely need image bytes.
 */
export async function listCopySummaries(): Promise<CopySummary[]> {
  const db = await openCopies();
  try {
    const tx = db.transaction(['copies', 'assets'], 'readonly');
    const done = committed(tx);
    const docs = requestResult(tx.objectStore('copies').getAll() as IDBRequest<StoredCopyRecord[]>);
    const assetKeys = requestResult(tx.objectStore('assets').getAllKeys());
    const [copies, keys] = await Promise.all([docs, assetKeys, done]);
    const count = new Map<string, number>();
    for (const key of keys) {
      if (typeof key !== 'string') continue;
      try {
        const parsed: unknown = JSON.parse(key);
        if (!Array.isArray(parsed) || typeof parsed[0] !== 'string') continue;
        count.set(parsed[0], (count.get(parsed[0]) ?? 0) + 1);
      } catch { /* Ignore unrecognized keys, without loading their blob values. */ }
    }
    return copies.map((doc) => ({
      id: doc.id, legacyId: doc.legacyId, source: doc.source,
      label: doc.label, revision: doc.revision,
      createdAt: doc.createdAt, updatedAt: doc.updatedAt,
      type: typeof doc.snapshot.doc.type === 'string' ? doc.snapshot.doc.type : undefined,
      imageCount: doc.snapshot.images.length || count.get(doc.id) || doc.assetCount || 0,
      imageBytes: doc.snapshot.images.length
        ? doc.snapshot.images.reduce((sum, image) => sum + (image.blob?.size ?? 0), 0)
        : typeof doc.assetBytes === 'number' ? doc.assetBytes : null
    })).sort((a, b) => b.updatedAt - a.updatedAt);
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

/**
 * Lê só os metadados e o estado do documento, sem tocar nos Blobs de imagens (store 'assets').
 * Usado pelas miniaturas da biblioteca. Documentos antigos com imagens embutidas não têm as imagens devolvidas.
 */
export async function getCopyState(id: string): Promise<{ type?: string; revision: number; state: unknown; label: string } | undefined> {
  const db = await openCopies();
  try {
    const tx = db.transaction(['copies'], 'readonly');
    const done = committed(tx);
    const record = requestResult(tx.objectStore('copies').get(id) as IDBRequest<CopyRecord | undefined>);
    const [copy] = await Promise.all([record, done]);
    if (!copy) return undefined;
    return { type: copy.snapshot.doc.type, revision: copy.revision, state: copy.snapshot.doc.state, label: copy.label };
  } finally { db.close(); }
}

/**
 * Entire batch is a single readwrite transaction. No partial import on quota or validation failure.
 * `quota`: 'strict' (criar/duplicar) respeita o limite do app; 'elevate' (restaurar backup, migrar do Coding atual)
 * nunca recusa documentos que já existiam: o limite efetivo sobe para a faixa seguinte, até 1024.
 */
export type QuotaMode = 'strict' | 'elevate';
export async function importCopiesAtomic(records: readonly CopyRecord[], allowDuplicates = false, quota: QuotaMode = 'strict'): Promise<number> {
  if (!records.length) return 0;
  const identities = new Set<string>();
  const ids = new Set<string>();
  for (const record of records) {
    validCopy(record);
    const identity = JSON.stringify([record.source, record.legacyId]);
    if (ids.has(record.id) || (!allowDuplicates && identities.has(identity))) throw new DuplicateCopy();
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
    let reached: number | null = null;
    all.onsuccess = () => {
      const existingIds = new Set(all.result.map((copy) => copy.id));
      const existingSources = new Set(all.result.map((copy) => JSON.stringify([copy.source, copy.legacyId])));
      if (records.some((record) => existingIds.has(record.id) || (!allowDuplicates && existingSources.has(JSON.stringify([record.source, record.legacyId]))))) {
        duplicate = true; tx.abort(); return;
      }
      // Limite de projetos salvos de cada app, conferido dentro da mesma transação que grava:
      // duas janelas criando ao mesmo tempo não conseguem passar do limite.
      const saved = new Map<string, number>();
      for (const copy of all.result) { const k = appKeyForType(copy.snapshot.doc.type); saved.set(k, (saved.get(k) ?? 0) + 1); }
      const incoming = new Map<string, number>();
      for (const copy of records) { const k = appKeyForType(copy.snapshot.doc.type); incoming.set(k, (incoming.get(k) ?? 0) + 1); }
      const settings = loadLimitSettings();
      const recommended = loadRecommended();
      for (const [key, adding] of incoming) {
        const have = saved.get(key) ?? 0;
        if (quota === 'elevate') {
          if (have + adding > MAX_TIER) { reached = MAX_TIER; tx.abort(); return; }
          continue;
        }
        const effective = effectiveLimit(settings, key, have, recommended);
        if (!canAdd(effective, adding)) { reached = effective.limit; tx.abort(); return; }
      }
      for (const copy of records) {
        store.add(withoutEmbeddedImages(copy));
        queueAssets(assets, copy.id, copy.snapshot.images);
      }
    };
    try { await done; } catch (err) { if (duplicate) throw new DuplicateCopy(); if (reached !== null) throw new LimitReached(reached); throw err; }
  } finally { db.close(); }
  for (const record of records) notify(record.id);
  return records.length;
}

/** Creates a brand-new copy only if no copy from the same origin already exists. */
export async function createCopy(snapshot: LegacySnapshot, allowDuplicate = false): Promise<CopyRecord> {
  validateSnapshot(snapshot);
  const now = Date.now();
  const copy: CopyRecord = {
    id: newId(), legacyId: snapshot.doc.id, source: snapshot.source, label: documentName(snapshot.doc),
    revision: 1, createdAt: now, updatedAt: now, snapshot
  };
  await importCopiesAtomic([copy], allowDuplicate);
  return copy;
}

/**
 * Import selected legacy documents as one atomic, conflict-checked batch.
 * Use this for the Import Wizard once its UI supports all-or-nothing confirmation.
 */
/**
 * Datas de um documento importado: preserva as originais quando são plausíveis
 * (depois de 2000 e no máximo 1 dia no futuro); caso contrário usa o momento da importação.
 */
export function importedTimes(doc: LegacyDoc, now = Date.now()): { createdAt: number; updatedAt: number } {
  const plausible = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 946_684_800_000 && value <= now + 86_400_000;
  const updatedAt = plausible(doc.updatedAt) ? doc.updatedAt : now;
  const created = (doc as { createdAt?: unknown }).createdAt;
  const createdAt = plausible(created) && created <= updatedAt ? created : updatedAt;
  return { createdAt, updatedAt };
}

export async function importLegacySnapshotsAtomic(snapshots: readonly LegacySnapshot[]): Promise<number> {
  const now = Date.now();
  const entries: CopyRecord[] = snapshots.map((snapshot) => {
    validateSnapshot(snapshot);
    return {
      id: newId(), legacyId: snapshot.doc.id, source: snapshot.source,
      label: documentName(snapshot.doc), revision: 1,
      ...importedTimes(snapshot.doc, now), snapshot
    };
  });
  return importCopiesAtomic(entries, false, 'elevate');
}

export interface StorageEstimate {
  supported: boolean;
  usage: number | null;
  quota: number | null;
  percentage: number | null;
  persisted: boolean | null;
}
/** Approximate origin-wide quota; never describe it as reserved free disk space. */
export async function estimateStorage(): Promise<StorageEstimate> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { supported: false, usage: null, quota: null, percentage: null, persisted: null };
  }
  const estimate = await navigator.storage.estimate();
  const usage = typeof estimate.usage === 'number' ? estimate.usage : null;
  const quota = typeof estimate.quota === 'number' ? estimate.quota : null;
  const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null;
  return { supported: true, usage, quota, percentage: usage !== null && quota && quota > 0 ? 100 * usage / quota : null, persisted };
}
/** Must be called as the result of an explicit user's click, not during page load. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
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
  let committedImages: LegacyImage[] = [];
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
      if (!mustReplace && !shouldMigrate) {
        const readImages = assets.index('copyId').getAll(IDBKeyRange.only(id)) as IDBRequest<AssetRecord[]>;
        readImages.onsuccess = () => { committedImages = readImages.result.map((record) => record.image); };
      } else {
        committedImages = images;
      }
      if (mustReplace || shouldMigrate) {
        // Gather existing keys before enqueuing new assets, avoiding duplicate-key collisions.
        const keys = assets.index('copyId').getAllKeys(IDBKeyRange.only(id));
        keys.onsuccess = () => {
          for (const key of keys.result) assets.delete(key);
          queueAssets(assets, id, images);
        };
      }
      updated = {
        ...current, label: changes.label?.trim() ?? current.label,
        snapshot: { ...(changes.snapshot ?? current.snapshot), images: [] },
        revision: current.revision + 1, updatedAt: Date.now()
      };
      copies.put({
        ...updated,
        ...(mustReplace || shouldMigrate ? {
          assetCount: images.length,
          assetBytes: images.reduce((sum, image) => sum + (image.blob?.size ?? 0), 0)
        } : {})
      } satisfies StoredCopyRecord);
    };
    try { await done; } catch (err) {
      if (conflict) throw new RevisionConflict();
      if (missing) throw new MissingCopy();
      throw err;
    }
  } finally { db.close(); }
  if (!updated) throw new Error('Gravação não confirmada.');
  // Return precisely the revision committed by THIS transaction. Reading again
  // could return a different window's later write and misleadingly label it ours.
  notify(id);
  return { ...updated, snapshot: { ...updated.snapshot, images: committedImages } };
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

/**
 * Explicit alternative during a conflict: create a separately identified copy.
 * Never overwrites the conflicting revision. UI must request this action explicitly.
 */
export async function forkCopy(id: string, label: string): Promise<CopyRecord> {
  if (!label.trim() || label.length > 250) throw new Error('Nome da nova cópia inválido.');
  const current = await getCopy(id);
  if (!current) throw new MissingCopy();
  const now = Date.now();
  const fork: CopyRecord = {
    ...current, id: newId(), label: label.trim(), revision: 1,
    createdAt: now, updatedAt: now, snapshot: current.snapshot
  };
  await importCopiesAtomic([fork], true);
  return fork;
}

/** Explicit deletion, isolated to the v2 database, including all referenced blobs. */
export async function deleteCopy(id: string, expectedRevision: number): Promise<void> {
  const db = await openCopies();
  let conflict = false;
  let missing = false;
  try {
    const tx = db.transaction(['copies', 'assets'], 'readwrite');
    const done = committed(tx);
    const store = tx.objectStore('copies');
    const assets = tx.objectStore('assets');
    const get = store.get(id) as IDBRequest<CopyRecord | undefined>;
    get.onsuccess = () => {
      const copy = get.result;
      if (!copy) { missing = true; tx.abort(); return; }
      if (copy.revision !== expectedRevision) { conflict = true; tx.abort(); return; }
      store.delete(id);
      const keys = assets.index('copyId').getAllKeys(IDBKeyRange.only(id));
      keys.onsuccess = () => { for (const key of keys.result) assets.delete(key); };
    };
    try { await done; } catch (err) {
      if (conflict) throw new RevisionConflict();
      if (missing) throw new MissingCopy();
      throw err;
    }
  } finally { db.close(); }
  forgetDocument(id);
  notify(id);
}

/** Quantos projetos salvos cada app tem (a contagem de cada app é independente das demais). */
export async function countSavedByApp(): Promise<Record<string, number>> {
  // Só conta se o banco já existir: abrir um app não pode criar o banco de cópias (nada é gravado antes da primeira edição).
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return {};
  if (!(await indexedDB.databases()).some((d) => d.name === COPIES_DB_NAME)) return {};
  const db = await openCopies();
  try {
    const tx = db.transaction('copies', 'readonly');
    const done = committed(tx);
    const all = requestResult(tx.objectStore('copies').getAll() as IDBRequest<CopyRecord[]>);
    const [copies] = await Promise.all([all, done]);
    const counts: Record<string, number> = {};
    for (const copy of copies) { const k = appKeyForType(copy.snapshot.doc.type); counts[k] = (counts[k] ?? 0) + 1; }
    return counts;
  } finally { db.close(); }
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
