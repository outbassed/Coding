/**
 * Backup em ZIP (formato "coding-v2-zip-backup", versão 1).
 *
 * Um .zip comum, que qualquer programa abre:
 *   manifesto.json          índice versionado: documentos, lotes e imagens, cada arquivo com seu SHA-256
 *   LEIAME.txt              explicação em português
 *   documentos/lote-NNNN.json  até 100 cópias por arquivo, no JSON assinado do Coding 2.0 (sem os bytes das imagens)
 *   imagens/NNNNNN.bin      bytes originais de cada imagem
 *
 * Quem lê nunca confia no arquivo: nomes fora do padrão, itens repetidos ou não listados, tamanhos, versões, hashes
 * e ids repetidos fazem a restauração inteira ser recusada, antes de gravar qualquer coisa.
 */
import { buildZip, canCompress, extractEntry, listZip, safeEntryName, ZipError, MAX_ENTRIES, type ZipEntry, type ZipInput } from '../apps/zip/zip';
import { decodeBackupEntries, encodeCopyBackup } from './archive';
import { assertCopy, sanitised } from './archive-pack';
import { importCopiesAtomic, type CopyRecord } from './documents';
import { appKeyForType } from '../workspace/limits';

export const ZIP_BACKUP_FORMAT = 'coding-v2-zip-backup';
export const ZIP_BACKUP_VERSION = 1;
export const BATCH_SIZE = 100;
const MANIFEST = 'manifesto.json';
const README = 'LEIAME.txt';
const MAX_MANIFEST = 16 * 1024 * 1024;
const MAX_COPIES = 2000;

interface ManifestImage { docId: string; imageId: string; file: string; size: number; sha256: string; mime: string }
interface ManifestBatch { file: string; sha256: string; ids: string[] }
interface ManifestDoc { id: string; type: string; app: string; label: string; revision: number }
export interface ZipManifest {
  format: typeof ZIP_BACKUP_FORMAT;
  version: typeof ZIP_BACKUP_VERSION;
  createdAt: string;
  total: number;
  byApp: Record<string, number>;
  documents: ManifestDoc[];
  batches: ManifestBatch[];
  images: ManifestImage[];
}
export interface ZipBackup { bytes: Uint8Array; files: number; documents: number; images: number }

const enc = new TextEncoder();
async function sha256(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const pad = (n: number, width: number): string => String(n).padStart(width, '0');

const README_TEXT = [
  'Backup do Coding 2.0 (ZIP)',
  '',
  'Este arquivo guarda cópias dos seus projetos. Para restaurar, abra a Biblioteca do Coding 2.0 e use “Importar backup”.',
  '',
  '- manifesto.json: índice com versão, lista de projetos e a impressão digital (SHA-256) de cada arquivo.',
  '- documentos/: os projetos, em JSON assinado do Coding 2.0.',
  '- imagens/: os arquivos de imagem originais dos projetos.',
  '',
  'Restaurar nunca substitui projetos existentes: o que já está no aparelho continua como está.',
  'Não edite estes arquivos: qualquer alteração faz a restauração ser recusada para proteger seus dados.',
  ''
].join('\n');

/** Monta o ZIP de backup. Falha com mensagem clara se passar dos limites de um ZIP (use um app por vez). */
export async function buildZipBackup(copies: readonly CopyRecord[], now: Date = new Date()): Promise<ZipBackup> {
  if (!copies.length) throw new ZipError('Não há projetos para exportar.');
  if (copies.length > MAX_COPIES) throw new ZipError('Um backup ZIP tem no máximo 2.000 projetos. Exporte um app por vez.');
  const ids = new Set<string>();
  for (const copy of copies) {
    assertCopy(copy);
    if (ids.has(copy.id)) throw new ZipError('Há projetos repetidos na seleção.');
    ids.add(copy.id);
  }
  const files: ZipInput[] = [];
  const manifest: ZipManifest = {
    format: ZIP_BACKUP_FORMAT, version: ZIP_BACKUP_VERSION, createdAt: now.toISOString(), total: copies.length, byApp: {},
    documents: [], batches: [], images: []
  };
  let imageNumber = 0;
  for (let from = 0, batchNumber = 1; from < copies.length; from += BATCH_SIZE, batchNumber++) {
    const slice = copies.slice(from, from + BATCH_SIZE);
    const text = await encodeCopyBackup(slice.map(sanitised));
    const data = enc.encode(text);
    const file = 'documentos/lote-' + pad(batchNumber, 4) + '.json';
    files.push({ name: file, data, modified: now.getTime() });
    manifest.batches.push({ file, sha256: await sha256(data), ids: slice.map((c) => c.id) });
    for (const copy of slice) {
      const app = appKeyForType(copy.snapshot.doc.type);
      manifest.byApp[app] = (manifest.byApp[app] ?? 0) + 1;
      manifest.documents.push({ id: copy.id, type: typeof copy.snapshot.doc.type === 'string' ? copy.snapshot.doc.type : '', app, label: copy.label, revision: copy.revision });
      for (const image of copy.snapshot.images) {
        const blob = image.blob;
        if (!blob) throw new ZipError('Uma imagem de “' + copy.label + '” não tem conteúdo.');
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const name = 'imagens/' + pad(++imageNumber, 6) + '.bin';
        files.push({ name, data: bytes, modified: now.getTime() });
        manifest.images.push({ docId: copy.id, imageId: image.id, file: name, size: bytes.length, sha256: await sha256(bytes), mime: blob.type || (typeof image.mime === 'string' ? image.mime : '') });
      }
    }
  }
  files.unshift({ name: README, data: enc.encode(README_TEXT), modified: now.getTime() });
  files.unshift({ name: MANIFEST, data: enc.encode(JSON.stringify(manifest, null, 2)), modified: now.getTime() });
  if (files.length > MAX_ENTRIES) throw new ZipError('Este backup teria ' + files.length + ' arquivos, acima do limite de ' + MAX_ENTRIES + ' por ZIP. Exporte um app por vez.');
  const built = await buildZip(files, { compress: canCompress() });
  return { bytes: built.bytes, files: built.files, documents: copies.length, images: manifest.images.length };
}

function validName(name: string): boolean {
  return name === safeEntryName(name) && (name === MANIFEST || name === README || /^documentos\/lote-\d{4}\.json$/.test(name) || /^imagens\/\d{6}\.bin$/.test(name));
}

function readManifest(raw: unknown): ZipManifest {
  if (!isObject(raw) || raw.format !== ZIP_BACKUP_FORMAT) throw new ZipError('Este ZIP não é um backup do Coding 2.0.');
  if (raw.version !== ZIP_BACKUP_VERSION) throw new ZipError('Versão de backup ZIP não suportada (' + String(raw.version) + '). Atualize o Coding 2.0.');
  const { documents, batches, images } = raw;
  if (!Array.isArray(documents) || !Array.isArray(batches) || !Array.isArray(images)) throw new ZipError('O manifesto do backup está incompleto.');
  if (documents.length === 0 || documents.length > MAX_COPIES || raw.total !== documents.length) throw new ZipError('O manifesto informa uma quantidade de projetos inválida.');
  const seen = new Set<string>();
  for (const d of documents) {
    if (!isObject(d) || typeof d.id !== 'string' || !d.id) throw new ZipError('O manifesto tem um projeto sem identificador.');
    if (seen.has(d.id)) throw new ZipError('O manifesto repete o identificador de um projeto. Restauração recusada.');
    seen.add(d.id);
  }
  for (const b of batches) {
    if (!isObject(b) || typeof b.file !== 'string' || !validName(b.file) || !/^[0-9a-f]{64}$/.test(String(b.sha256)) || !Array.isArray(b.ids) || !b.ids.every((x) => typeof x === 'string')) {
      throw new ZipError('O manifesto tem um lote inválido.');
    }
  }
  for (const i of images) {
    if (!isObject(i) || typeof i.docId !== 'string' || typeof i.imageId !== 'string' || typeof i.file !== 'string' || !validName(i.file)
      || !Number.isSafeInteger(i.size) || (i.size as number) < 0 || !/^[0-9a-f]{64}$/.test(String(i.sha256)) || typeof i.mime !== 'string') {
      throw new ZipError('O manifesto tem uma imagem inválida.');
    }
  }
  return raw as unknown as ZipManifest;
}

/** Lê e valida o ZIP inteiro. Devolve as cópias prontas; não grava nada. */
export async function decodeZipBackup(input: Uint8Array): Promise<CopyRecord[]> {
  const listing = listZip(input);
  const byName = new Map<string, ZipEntry>();
  for (const entry of listing.entries) {
    if (entry.directory) continue;
    if (entry.unsafe) throw new ZipError('O ZIP tem um caminho perigoso (“' + entry.rawName.slice(0, 60) + '”). Restauração recusada.');
    if (!validName(entry.name)) throw new ZipError('O ZIP tem um arquivo inesperado (“' + entry.name.slice(0, 60) + '”). Restauração recusada.');
    const key = entry.name.toLowerCase();
    if (byName.has(key)) throw new ZipError('O ZIP repete o arquivo “' + entry.name + '”. Restauração recusada.');
    byName.set(key, entry);
  }
  const manifestEntry = byName.get(MANIFEST);
  if (!manifestEntry) throw new ZipError('Este ZIP não tem manifesto: não é um backup do Coding 2.0.');
  if (manifestEntry.size > MAX_MANIFEST) throw new ZipError('O manifesto do backup é grande demais.');
  let manifest: ZipManifest;
  try { manifest = readManifest(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await extractEntry(input, manifestEntry)))); }
  catch (err) { if (err instanceof ZipError) throw err; throw new ZipError('O manifesto do backup está ilegível ou corrompido.'); }

  const referenced = new Set<string>([MANIFEST.toLowerCase(), README.toLowerCase()]);
  const copies = new Map<string, CopyRecord>();
  for (const batch of manifest.batches) {
    const entry = byName.get(batch.file.toLowerCase());
    if (!entry) throw new ZipError('Falta o arquivo “' + batch.file + '” do backup.');
    referenced.add(batch.file.toLowerCase());
    const data = await extractEntry(input, entry);
    if ((await sha256(data)) !== batch.sha256) throw new ZipError('“' + batch.file + '” foi alterado ou está corrompido (SHA-256 não confere).');
    const entries = await decodeBackupEntries(new TextDecoder('utf-8', { fatal: true }).decode(data));
    if (entries.length !== batch.ids.length) throw new ZipError('“' + batch.file + '” tem uma quantidade de projetos diferente da informada.');
    entries.forEach((e, i) => {
      if (e.kind !== 'copy') throw new ZipError('“' + batch.file + '” deve conter projetos completos.');
      if (e.copy.id !== batch.ids[i]) throw new ZipError('Os identificadores de “' + batch.file + '” não conferem com o manifesto.');
      if (copies.has(e.copy.id)) throw new ZipError('O backup repete o identificador de um projeto. Restauração recusada.');
      copies.set(e.copy.id, e.copy);
    });
  }
  const listed = new Set(manifest.documents.map((d) => d.id));
  if (copies.size !== listed.size || [...copies.keys()].some((id) => !listed.has(id))) throw new ZipError('Os projetos do ZIP não conferem com o manifesto.');

  const expectedImages = [...copies.values()].reduce((n, c) => n + c.snapshot.images.length, 0);
  if (manifest.images.length !== expectedImages) throw new ZipError('Imagens faltando ou em excesso no backup.');
  const usedImages = new Set<string>();
  for (const image of manifest.images) {
    const copy = copies.get(image.docId);
    const target = copy?.snapshot.images.find((x) => x.id === image.imageId);
    if (!copy || !target) throw new ZipError('Uma imagem do manifesto não pertence a nenhum projeto.');
    const key = image.docId + '\u0000' + image.imageId;
    if (usedImages.has(key)) throw new ZipError('O manifesto repete uma imagem.');
    usedImages.add(key);
    const entry = byName.get(image.file.toLowerCase());
    if (!entry) throw new ZipError('Falta o arquivo “' + image.file + '” do backup.');
    referenced.add(image.file.toLowerCase());
    const data = await extractEntry(input, entry);
    if (data.length !== image.size) throw new ZipError('“' + image.file + '” tem tamanho diferente do informado.');
    if ((await sha256(data)) !== image.sha256) throw new ZipError('“' + image.file + '” foi alterado ou está corrompido (SHA-256 não confere).');
    target.blob = new Blob([data as BlobPart], { type: image.mime });
  }
  for (const name of byName.keys()) if (!referenced.has(name)) throw new ZipError('O ZIP tem um arquivo não listado no manifesto (“' + name + '”). Restauração recusada.');
  const result = [...copies.values()];
  for (const copy of result) assertCopy(copy);
  return result;
}

/** Restaura com as mesmas proteções do JSON: tudo ou nada, sem sobrescrever ids existentes. */
export async function importZipBackup(input: Uint8Array): Promise<number> {
  const copies = await decodeZipBackup(input);
  return importCopiesAtomic(copies, true, 'elevate');
}

/** O arquivo parece um ZIP? (assinatura local, vazio ou fim do índice) */
export function looksLikeZip(head: Uint8Array): boolean {
  return head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && (head[2] === 3 || head[2] === 5) && (head[3] === 4 || head[3] === 6);
}
