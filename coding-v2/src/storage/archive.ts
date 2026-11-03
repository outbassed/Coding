import {
  importCopiesAtomic, importedTimes, validateSnapshot,
  type CopyRecord, type LegacyDoc, type LegacyImage, type LegacySnapshot
} from './documents';

const SCHEMA = 'coding-v2-safe-backup';
const LEGACY_MARK = '$codingV2BinaryType';
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 2000;
const MAX_BINARY = 32 * 1024 * 1024;

type BackupEntry = { kind: 'snapshot'; snapshot: LegacySnapshot } | { kind: 'copy'; copy: CopyRecord };
interface ArchiveV2 {
  schema: typeof SCHEMA;
  version: 2;
  exportedAt: string;
  count: number;
  entries: Array<{ sha256: string; value: unknown }>;
}
interface ArchiveV1 { schema: typeof SCHEMA; version: 1; entries: unknown[]; }

function bytesToBase64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 16384) text += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(text);
}
/**
 * O(n) base64 validation. The original repeated-group regexp catastrophically
 * overflowed the JS stack for ordinary 3–4 MiB phone photos.
 * Check encoded length and padding BEFORE calling atob, avoiding extra allocations
 * for files exceeding the experimental 32 MiB decoded-file limit.
 */
function base64ToBytes(text: string): Uint8Array<ArrayBuffer> {
  if (text.length % 4 !== 0) throw new Error('Dados binários codificados incorretamente.');
  const length = text.length;
  const padding = length && text[length - 1] === '=' ? (text[length - 2] === '=' ? 2 : 1) : 0;
  const decodedLength = length / 4 * 3 - padding;
  if (decodedLength > MAX_BINARY) throw new Error('Imagem ou anexo excede o limite de 32 MB desta versão.');
  for (let i = 0; i < length - padding; i++) {
    const code = text.charCodeAt(i);
    const valid = (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
      || (code >= 48 && code <= 57) || code === 43 || code === 47;
    if (!valid) throw new Error('Dados binários codificados incorretamente.');
  }
  for (let i = length - padding; i < length; i++) {
    if (text.charCodeAt(i) !== 61) throw new Error('Dados binários codificados incorretamente.');
  }
  // At least 2 alphabet characters must precede padding within the final quartet.
  if (padding > 0 && length < 4) throw new Error('Dados binários codificados incorretamente.');
  const raw = atob(text);
  if (raw.length !== decodedLength) throw new Error('Dados binários codificados incorretamente.');
  const result = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) result[i] = raw.charCodeAt(i);
  return result;
}
async function sha256(bytes: Uint8Array<ArrayBuffer> | ArrayBuffer): Promise<string> {
  const input = bytes instanceof ArrayBuffer ? bytes : bytes.buffer;
  const digest = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
async function stringHash(text: string): Promise<string> {
  return sha256(new TextEncoder().encode(text));
}
function limited(value: string): string {
  if (new Blob([value]).size > MAX_BYTES) throw new Error('Backup excede o limite experimental de 64 MB. Não foi exportado/importado.');
  return value;
}
const primitive = (value: unknown): value is string | number | boolean | null =>
  value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

const typedNames = new Set(['Uint8Array', 'Uint8ClampedArray', 'Uint16Array', 'Uint32Array',
  'Int8Array', 'Int16Array', 'Int32Array', 'Float32Array', 'Float64Array',
  'BigInt64Array', 'BigUint64Array', 'DataView']);
async function encode(value: unknown, seen = new WeakSet<object>()): Promise<unknown> {
  if (value === undefined) return { t: 'undefined' };
  if (typeof value === 'bigint') return { t: 'bigint', v: value.toString() };
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) return { t: 'number', v: String(value) };
    return value;
  }
  if (primitive(value)) return value;
  if (typeof value !== 'object' || value === null) throw new Error('Tipo não suportado no backup: ' + typeof value);
  if (seen.has(value)) throw new Error('Objetos circulares não podem ser incluídos no backup.');
  if (value instanceof Date) return { t: 'date', v: value.toISOString() };
  if (value instanceof Blob) {
    if (value.size > MAX_BINARY) throw new Error('Um arquivo excede o limite experimental de 32 MB.');
    const bytes = new Uint8Array(await value.arrayBuffer());
    const binary = { t: value instanceof File ? 'file' : 'blob', v: bytesToBase64(bytes),
      sha256: await sha256(bytes), mime: value.type };
    return value instanceof File ? { ...binary, name: value.name, lastModified: value.lastModified } : binary;
  }
  if (value instanceof ArrayBuffer) {
    if (value.byteLength > MAX_BINARY) throw new Error('Anexo excede 32 MB.');
    const bytes = new Uint8Array(value);
    return { t: 'buffer', v: bytesToBase64(bytes), sha256: await sha256(bytes) };
  }
  if (ArrayBuffer.isView(value)) {
    const ctor = value.constructor.name;
    if (!typedNames.has(ctor)) throw new Error('Tipo binário não suportado: ' + ctor);
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (bytes.byteLength > MAX_BINARY) throw new Error('Anexo excede 32 MB.');
    return { t: 'typed', ctor, v: bytesToBase64(bytes), sha256: await sha256(new Uint8Array(bytes)) };
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const entries = [];
      for (const item of value) entries.push(await encode(item, seen));
      return { t: 'array', v: entries };
    }
    if (value instanceof Map) {
      const entries = [];
      for (const [key, item] of value.entries()) entries.push([await encode(key, seen), await encode(item, seen)]);
      return { t: 'map', v: entries };
    }
    if (value instanceof Set) {
      const entries = [];
      for (const item of value) entries.push(await encode(item, seen));
      return { t: 'set', v: entries };
    }
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new Error('Objeto complexo não suportado; exportação interrompida sem perda.');
    const pairs: Array<[string, unknown]> = [];
    for (const [key, item] of Object.entries(value)) pairs.push([key, await encode(item, seen)]);
    // Key/value pairs protect reserved keys and objects named "$codingV2BinaryType".
    return { t: 'object', v: pairs };
  } finally { seen.delete(value); }
}
function fields(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Entrada de backup malformada.');
  return value as Record<string, unknown>;
}
async function decode(value: unknown): Promise<unknown> {
  if (primitive(value)) return value;
  const packed = fields(value);
  const t = packed.t;
  if (typeof t !== 'string') throw new Error('Tipo de valor inválido no arquivo.');
  if (t === 'undefined') return undefined;
  if (t === 'number') {
    if (!['NaN', 'Infinity', '-Infinity', '0'].includes(packed.v as string)) throw new Error('Número especial inválido.');
    return packed.v === 'NaN' ? NaN : packed.v === 'Infinity' ? Infinity : packed.v === '-Infinity' ? -Infinity : -0;
  }
  if (t === 'bigint') { if (typeof packed.v !== 'string' || !/^-?\d+$/.test(packed.v)) throw new Error('BigInt inválido.'); return BigInt(packed.v); }
  if (t === 'date') { const date = new Date(String(packed.v)); if (Number.isNaN(date.getTime())) throw new Error('Data inválida.'); return date; }
  if (['blob','file','buffer','typed'].includes(t)) {
    if (typeof packed.v !== 'string' || typeof packed.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(packed.sha256)) throw new Error('Anexo sem dados ou assinatura.');
    const bytes = base64ToBytes(packed.v);
    if ((await sha256(bytes)) !== packed.sha256.toLowerCase()) throw new Error('Integridade do anexo não confere (SHA-256).');
    if (t === 'blob') return new Blob([bytes], { type: String(packed.mime ?? '') });
    if (t === 'file') {
      if (typeof packed.name !== 'string' || typeof packed.lastModified !== 'number') throw new Error('Arquivo sem nome ou data.');
      return new File([bytes], packed.name, { type: String(packed.mime ?? ''), lastModified: packed.lastModified });
    }
    const buffer = bytes.buffer;
    if (t === 'buffer') return buffer;
    const ctor = packed.ctor;
    switch (ctor) {
      case 'Uint8Array': return new Uint8Array(buffer);
      case 'Uint8ClampedArray': return new Uint8ClampedArray(buffer);
      case 'Uint16Array': return new Uint16Array(buffer);
      case 'Uint32Array': return new Uint32Array(buffer);
      case 'Int8Array': return new Int8Array(buffer);
      case 'Int16Array': return new Int16Array(buffer);
      case 'Int32Array': return new Int32Array(buffer);
      case 'Float32Array': return new Float32Array(buffer);
      case 'Float64Array': return new Float64Array(buffer);
      case 'BigInt64Array': return new BigInt64Array(buffer);
      case 'BigUint64Array': return new BigUint64Array(buffer);
      case 'DataView': return new DataView(buffer);
      default: throw new Error('Tipo binário não reconhecido: ' + String(ctor));
    }
  }
  if (!Array.isArray(packed.v)) throw new Error('Coleção inválida no backup.');
  if (t === 'array') {
    const values = [];
    for (const item of packed.v) values.push(await decode(item));
    return values;
  }
  if (t === 'set') {
    const result = new Set<unknown>();
    for (const item of packed.v) result.add(await decode(item));
    return result;
  }
  if (t === 'map') {
    const result = new Map<unknown, unknown>();
    for (const pair of packed.v) {
      if (!Array.isArray(pair) || pair.length !== 2) throw new Error('Map inválido.');
      result.set(await decode(pair[0]), await decode(pair[1]));
    }
    return result;
  }
  if (t === 'object') {
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const pair of packed.v) {
      if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string') throw new Error('Chave inválida.');
      // null prototype makes even "__proto__" a safe data key.
      if (Object.hasOwn(result, pair[0])) throw new Error('Chave repetida.');
      result[pair[0]] = await decode(pair[1]);
    }
    return result;
  }
  throw new Error('Marcador de tipo não reconhecido: ' + t);
}

/** Legacy experimental v1 backup decoding, for existing backups only. */
function decodeV1(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(decodeV1);
  const object = value as Record<string, unknown>;
  if (Object.hasOwn(object, LEGACY_MARK)) {
    switch (object[LEGACY_MARK]) {
      case 'blob':
        return new Blob([base64ToBytes(String(object.base64))], { type: String(object.mime ?? '') });
      case 'buffer': return base64ToBytes(String(object.base64)).buffer;
      case 'typed': {
        const buf = base64ToBytes(String(object.base64)).buffer;
        const ctor = String(object.ctor);
        switch (ctor) {
          case 'Uint8Array': return new Uint8Array(buf);
          case 'Uint8ClampedArray': return new Uint8ClampedArray(buf);
          case 'Uint16Array': return new Uint16Array(buf);
          case 'Uint32Array': return new Uint32Array(buf);
          case 'Int8Array': return new Int8Array(buf);
          case 'Int16Array': return new Int16Array(buf);
          case 'Int32Array': return new Int32Array(buf);
          case 'Float32Array': return new Float32Array(buf);
          case 'Float64Array': return new Float64Array(buf);
          case 'BigInt64Array': return new BigInt64Array(buf);
          case 'BigUint64Array': return new BigUint64Array(buf);
          case 'DataView': return new DataView(buf);
          default: throw new Error('Tipo legado não reconhecido: ' + ctor);
        }
      }
      case 'date': return new Date(String(object.iso));
      default: throw new Error('Marcador de backup antigo desconhecido.');
    }
  }
  const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [key, item] of Object.entries(object)) copy[key] = decodeV1(item);
  return copy;
}
function validateCopy(copy: CopyRecord): void {
  if (!copy || typeof copy.id !== 'string' || !copy.id || typeof copy.legacyId !== 'string' || !copy.legacyId
    || typeof copy.label !== 'string' || !copy.label.trim() || copy.label.length > 250
    || !Number.isSafeInteger(copy.revision) || copy.revision < 1
    || !Number.isFinite(copy.createdAt) || !Number.isFinite(copy.updatedAt)
    || !['indexeddb', 'localStorage', 'backup', 'v2'].includes(copy.source)) throw new Error('Metadados de cópia inválidos.');
  validateSnapshot(copy.snapshot);
}
async function encodeEntries(entries: BackupEntry[]): Promise<string> {
  if (entries.length > MAX_ENTRIES) throw new Error('O backup não pode ter mais de 2.000 documentos.');
  const packed: ArchiveV2['entries'] = [];
  for (const entry of entries) {
    if (entry.kind === 'snapshot') validateSnapshot(entry.snapshot);
    else validateCopy(entry.copy);
    const value = await encode(entry);
    packed.push({ value, sha256: await stringHash(JSON.stringify(value)) });
  }
  return limited(JSON.stringify({
    schema: SCHEMA, version: 2, exportedAt: new Date().toISOString(), count: entries.length, entries: packed
  } satisfies ArchiveV2, null, 2));
}
/** Export of the old source, preserving image bytes and arbitrary valid JSON document fields. */
export async function encodeBackup(snapshots: readonly LegacySnapshot[]): Promise<string> {
  return encodeEntries(snapshots.map((snapshot) => ({ kind: 'snapshot' as const, snapshot })));
}
/** Export of v2 copies, including ID, label, revision, origin and all binary data. */
export async function encodeCopyBackup(copies: readonly CopyRecord[]): Promise<string> {
  return encodeEntries(copies.map((copy) => ({ kind: 'copy' as const, copy })));
}

export async function decodeBackupEntries(text: string): Promise<BackupEntry[]> {
  limited(text);
  const data: unknown = JSON.parse(text);
  const root = fields(data);
  if (root.schema !== SCHEMA || !Array.isArray(root.entries) || root.entries.length > MAX_ENTRIES) throw new Error('Arquivo de backup não reconhecido.');
  if (root.version === 1) {
    return (root as unknown as ArchiveV1).entries.map((item): BackupEntry => {
      const snapshot = decodeV1(item) as LegacySnapshot;
      validateSnapshot(snapshot);
      return { kind: 'snapshot', snapshot };
    });
  }
  if (root.version !== 2 || root.count !== root.entries.length) throw new Error('Versão ou quantidade do backup inválida.');
  const entries: BackupEntry[] = [];
  for (const item of root.entries) {
    const record = fields(item);
    if (typeof record.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(record.sha256)) throw new Error('Arquivo sem verificação de integridade.');
    if ((await stringHash(JSON.stringify(record.value))) !== record.sha256.toLowerCase()) throw new Error('O backup foi alterado ou corrompido. SHA-256 inválido.');
    const entry = await decode(record.value) as BackupEntry;
    if (entry?.kind === 'snapshot') validateSnapshot(entry.snapshot);
    else if (entry?.kind === 'copy') validateCopy(entry.copy);
    else throw new Error('Tipo de entrada não reconhecido.');
    entries.push(entry);
  }
  return entries;
}

/** Compatibility for existing code: decodes snapshots, and keeps copies as snapshots. */
export async function decodeBackup(text: string): Promise<LegacySnapshot[]> {
  return (await decodeBackupEntries(text)).map((entry) => entry.kind === 'snapshot' ? entry.snapshot : entry.copy.snapshot);
}
export async function importBackupToCopies(text: string): Promise<number> {
  const entries = await decodeBackupEntries(text);
  const copies: CopyRecord[] = entries.map((entry) => {
    if (entry.kind === 'copy') return entry.copy;
    const snapshot = entry.snapshot;
    const label = (snapshot.doc.state && typeof snapshot.doc.state.name === 'string' && snapshot.doc.state.name.trim())
      || (typeof snapshot.doc.name === 'string' && snapshot.doc.name.trim()) || 'Documento sem nome';
    return {
      id: crypto.randomUUID(), legacyId: snapshot.doc.id, source: 'backup',
      label: label.slice(0, 250), revision: 1, ...importedTimes(snapshot.doc),
      snapshot: { ...snapshot, source: 'backup' }
    };
  });
  // A signed v2 archive may contain two deliberate forks from the same source.
  // Their distinct copy IDs must both restore; re-importing an existing ID still fails.
  return importCopiesAtomic(copies, entries.every((entry) => entry.kind === 'copy'), 'elevate');
}
export function downloadBackup(text: string, filename: string): void {
  limited(text);
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // This signals the browser to start a download, NOT that the file was saved to disk.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
