/**
 * Coding 2.0 binary backup format, version 1.
 *
 * The signed v2 JSON is kept for metadata only. Image Blobs are appended as
 * raw binary, avoiding base64's 4/3 expansion and its memory-heavy strings.
 * Each chunk is verified with SHA-256 independently; no external dependencies.
 *
 * This is a .codingpack file, NOT a ZIP. A future UI can offer JSON for small
 * documents and this format for large ones. Old .json backups stay compatible.
 */
import { encodeCopyBackup, decodeBackupEntries } from './archive';
import { validateSnapshot, importCopiesAtomic, type CopyRecord, type LegacyImage } from './documents';

const MAGIC = new TextEncoder().encode('CODING-PACK-1\n');
const CHUNK = 2 * 1024 * 1024;
const MAX_HEADER = 64 * 1024 * 1024;

export interface BinaryExport {
  blob: Blob;
  extension: '.codingpack' | '.json';
  kind: 'binary' | 'json';
}
interface AssetDescriptor {
  documentIndex: number;
  imageIndex: number;
  size: number;
  hashes: string[];
}
interface Manifest {
  format: 'coding-binary-backup';
  version: 1;
  metadata: string;
  assets: AssetDescriptor[];
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function assertCopy(record: CopyRecord): void {
  if (!record || typeof record.id !== 'string' || !record.id || !Number.isSafeInteger(record.revision)
    || record.revision < 1 || typeof record.legacyId !== 'string'
    || !['indexeddb', 'localStorage', 'backup', 'v2'].includes(record.source)) throw new Error('Cópia incompleta.');
  validateSnapshot(record.snapshot);
}
function checkedSize(value: unknown): number {
  if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < 0) throw new Error('Tamanho binário inválido.');
  return value;
}
async function digest(slice: Blob): Promise<string> {
  const buffer = await slice.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, '0')).join('');
}
async function hashes(blob: Blob): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; offset < blob.size; offset += CHUNK) out.push(await digest(blob.slice(offset, offset + CHUNK)));
  return out;
}
function sanitised(copy: CopyRecord): CopyRecord {
  // Do not include private storage indices or duplicate large images in the
  // metadata section. Empty blobs preserve image fields, IDs and MIME.
  return {
    id: copy.id, legacyId: copy.legacyId, source: copy.source,
    label: copy.label, revision: copy.revision,
    createdAt: copy.createdAt, updatedAt: copy.updatedAt,
    snapshot: {
      ...copy.snapshot,
      images: copy.snapshot.images.map((image): LegacyImage => ({
        ...image, blob: new Blob([], { type: image.blob?.type ?? '' })
      }))
    }
  };
}
export async function encodeBinaryPackage(copies: readonly CopyRecord[]): Promise<Blob> {
  if (!copies.length) throw new Error('Não há cópias para exportar.');
  if (copies.length > 2000) throw new Error('O pacote não pode conter mais de 2.000 documentos.');
  const ids = new Set<string>();
  for (const copy of copies) {
    assertCopy(copy);
    if (ids.has(copy.id)) throw new Error('O pacote contém IDs de cópia repetidos.');
    ids.add(copy.id);
  }
  const metadata = await encodeCopyBackup(copies.map(sanitised));
  const assets: AssetDescriptor[] = [];
  const pieces: Blob[] = [];
  for (const [documentIndex, copy] of copies.entries()) {
    for (const [imageIndex, image] of copy.snapshot.images.entries()) {
      const blob = image.blob!;
      const calculated = await hashes(blob);
      assets.push({ documentIndex, imageIndex, size: blob.size, hashes: calculated });
      pieces.push(blob);
    }
  }
  const manifest: Manifest = { format: 'coding-binary-backup', version: 1, metadata, assets };
  const header = new TextEncoder().encode(JSON.stringify(manifest));
  if (header.byteLength > MAX_HEADER) throw new Error('Metadados excedem o limite de 64 MiB.');
  const len = new ArrayBuffer(4);
  new DataView(len).setUint32(0, header.byteLength, true);
  return new Blob([MAGIC, len, header, ...pieces], { type: 'application/octet-stream' });
}

/** Validates every binary chunk before returning a single restorable record. */
export async function decodeBinaryPackage(file: Blob): Promise<CopyRecord[]> {
  if (file.size < MAGIC.length + 4) throw new Error('Pacote binário incompleto.');
  const header = new Uint8Array(await file.slice(0, MAGIC.length + 4).arrayBuffer());
  for (let i = 0; i < MAGIC.length; i++) if (header[i] !== MAGIC[i]) throw new Error('Este arquivo não é um pacote Coding.');
  const size = new DataView(header.buffer, header.byteOffset + MAGIC.length, 4).getUint32(0, true);
  if (size > MAX_HEADER || size === 0 || MAGIC.length + 4 + size > file.size) throw new Error('Cabeçalho do pacote inválido.');
  const from = MAGIC.length + 4;
  const payload = new TextDecoder('utf-8', { fatal: true }).decode(await file.slice(from, from + size).arrayBuffer());
  const decoded: unknown = JSON.parse(payload);
  if (!isObject(decoded) || decoded.format !== 'coding-binary-backup' || decoded.version !== 1
    || typeof decoded.metadata !== 'string' || !Array.isArray(decoded.assets)) throw new Error('Versão ou estrutura do pacote inválida.');

  const entries = await decodeBackupEntries(decoded.metadata);
  if (!entries.every((entry) => entry.kind === 'copy')) throw new Error('O pacote deve conter cópias completas.');
  const copies = entries.map((entry) => {
    if (entry.kind !== 'copy') throw new Error('Entrada inesperada no pacote.');
    return entry.copy;
  });
  if (!copies.length || copies.length > 2000) throw new Error('Número de cópias inválido.');
  const expectedAssets = copies.reduce((count, copy) => count + copy.snapshot.images.length, 0);
  if (decoded.assets.length !== expectedAssets) throw new Error('Imagens faltando ou em excesso no pacote.');

  const seen = new Set<string>();
  let position = from + size;
  for (const raw of decoded.assets) {
    if (!isObject(raw) || typeof raw.documentIndex !== 'number' || !Number.isSafeInteger(raw.documentIndex)
      || typeof raw.imageIndex !== 'number' || !Number.isSafeInteger(raw.imageIndex)
      || !Array.isArray(raw.hashes) || !raw.hashes.every((hash: unknown) => typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash))) {
      throw new Error('Descrição de imagem inválida.');
    }
    const doc = copies[raw.documentIndex];
    const image = doc?.snapshot.images[raw.imageIndex];
    if (!doc || !image) throw new Error('Imagem vinculada a documento inexistente.');
    const key = JSON.stringify([raw.documentIndex, raw.imageIndex]);
    if (seen.has(key)) throw new Error('Imagem duplicada no pacote.');
    seen.add(key);
    const length = checkedSize(raw.size);
    if (raw.hashes.length !== Math.ceil(length / CHUNK)) throw new Error('Quantidade de blocos incorreta.');
    if (position + length > file.size) throw new Error('O pacote está truncado.');
    const slice = file.slice(position, position + length);
    for (let chunkIndex = 0; chunkIndex < raw.hashes.length; chunkIndex++) {
      const left = chunkIndex * CHUNK;
      const actual = await digest(slice.slice(left, Math.min(left + CHUNK, length)));
      if (actual !== raw.hashes[chunkIndex]) throw new Error('Integridade da imagem não confere (SHA-256).');
    }
    image.blob = new Blob([slice], { type: image.blob?.type ?? '' });
    position += length;
  }
  if (position !== file.size) throw new Error('O pacote contém dados inesperados após as imagens.');
  for (const copy of copies) assertCopy(copy);
  return copies;
}
/** Import with the same atomic and duplicate-ID protections as signed JSON backups. */
export async function importBinaryPackage(file: Blob): Promise<number> {
  const copies = await decodeBinaryPackage(file);
  return importCopiesAtomic(copies, true, 'elevate');
}
/**
 * Choose the existing JSON format for small backups; use raw binary when JSON
 * exceeds its 32 MiB per-blob / 64 MiB total limits.
 */
export async function encodeSafeBackup(copies: readonly CopyRecord[]): Promise<BinaryExport> {
  if (!copies.length) throw new Error('Não há cópias para exportar.');
  const total = copies.reduce((sum, copy) => sum + copy.snapshot.images.reduce((sub, img) => sub + (img.blob?.size ?? 0), 0), 0);
  const large = copies.some((copy) => copy.snapshot.images.some((img) => (img.blob?.size ?? 0) > 32 * 1024 * 1024));
  if (!large && total < 40 * 1024 * 1024) {
    try {
      const text = await encodeCopyBackup(copies);
      return { blob: new Blob([text], { type: 'application/json;charset=utf-8' }), extension: '.json', kind: 'json' };
    } catch (error) {
      // Only size limits warrant fallback; malformed records must still fail.
      if (!(error instanceof Error) || !/excede o limite|excede 32 MB|excede 64 MB/i.test(error.message)) throw error;
    }
  }
  return { blob: await encodeBinaryPackage(copies), extension: '.codingpack', kind: 'binary' };
}
