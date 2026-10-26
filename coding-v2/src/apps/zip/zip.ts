/**
 * Compactador ZIP: escreve e lê arquivos .zip de verdade (formato PKWARE, sem ZIP64 nem senha).
 * Sem dependências: a compressão usa o CompressionStream/DecompressionStream do navegador ("deflate-raw").
 * Quem lê nunca confia no arquivo: tamanhos, posições e nomes são validados antes de qualquer cópia.
 */
export class ZipError extends Error {}

export const MAX_ENTRIES = 1000;
/** Limite de bytes (soma dos arquivos) tanto ao criar quanto ao abrir: o navegador mantém tudo na memória. */
export const MAX_TOTAL_BYTES = 200 * 1024 * 1024;
export const MAX_ENTRY_BYTES = 100 * 1024 * 1024;

// ------------------------------------------------------------ CRC-32
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = (TABLE[(c ^ (data[i] as number)) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ------------------------------------------------------------ nomes
/** Caminho seguro dentro do ZIP: sem barras invertidas, sem "..", sem raiz, sem caracteres de controle. Vazio se não sobrar nada. */
export function safeEntryName(raw: string): string {
  const parts = String(raw).normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\\/g, '/').split('/')
    .map((p) => p.trim()).filter((p) => p !== '' && p !== '.' && p !== '..');
  return parts.join('/').slice(0, 240);
}
/** Garante nomes únicos ("a.txt", "a (2).txt"), sem diferenciar maiúsculas de minúsculas. */
export function uniqueName(name: string, taken: ReadonlySet<string>): string {
  const lower = new Set([...taken].map((t) => t.toLowerCase()));
  if (!lower.has(name.toLowerCase())) return name;
  const slash = name.lastIndexOf('/');
  const dir = slash >= 0 ? name.slice(0, slash + 1) : '';
  const file = name.slice(slash + 1);
  const dot = file.lastIndexOf('.');
  const stem = dot > 0 ? file.slice(0, dot) : file;
  const ext = dot > 0 ? file.slice(dot) : '';
  for (let n = 2; n < 100_000; n++) {
    const candidate = dir + stem + ' (' + n + ')' + ext;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
  return dir + stem + '-' + Date.now() + ext;
}

// ------------------------------------------------------------ compressão
export const canCompress = (): boolean => typeof CompressionStream !== 'undefined';
export const canDecompress = (): boolean => typeof DecompressionStream !== 'undefined';
async function collect(stream: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) { await reader.cancel().catch(() => undefined); throw new ZipError('O conteúdo descompactado é maior do que o informado no arquivo.'); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}
async function through(format: 'compress' | 'decompress', data: Uint8Array, max: number): Promise<Uint8Array> {
  const stream = format === 'compress' ? new CompressionStream('deflate-raw') : new DecompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  // Escrita e leitura andam juntas (esperar a escrita antes de ler trava em arquivos grandes).
  writer.write(data as BufferSource).then(() => writer.close()).catch(() => undefined);
  try { return await collect(stream.readable as ReadableStream<Uint8Array>, max); }
  catch (error) { if (error instanceof ZipError) throw error; throw new ZipError('Os dados compactados estão corrompidos.'); }
}
export const deflateRaw = (data: Uint8Array): Promise<Uint8Array> => through('compress', data, Number.MAX_SAFE_INTEGER);
export const inflateRaw = (data: Uint8Array, max: number): Promise<Uint8Array> => through('decompress', data, max);

// ------------------------------------------------------------ escrever
export interface ZipInput { name: string; data: Uint8Array; modified?: number }
export interface BuildOptions { compress: boolean }
export interface BuildResult { bytes: Uint8Array; files: number; storedBytes: number; compressedEntries: number }

function dosDateTime(ms: number): { time: number; date: number } {
  const d = new Date(Number.isFinite(ms) ? ms : Date.now());
  const year = Math.min(2107, Math.max(1980, d.getFullYear()));
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  };
}
const enc = new TextEncoder();

/** Monta o .zip. Um arquivo só é gravado compactado se isso o deixar menor; senão fica armazenado. */
export async function buildZip(inputs: readonly ZipInput[], options: BuildOptions): Promise<BuildResult> {
  if (inputs.length === 0) throw new ZipError('Adicione pelo menos um arquivo.');
  if (inputs.length > MAX_ENTRIES) throw new ZipError('O limite é de ' + MAX_ENTRIES + ' arquivos por ZIP.');
  const total = inputs.reduce((s, i) => s + i.data.length, 0);
  if (total > MAX_TOTAL_BYTES) throw new ZipError('Os arquivos somam mais de ' + Math.round(MAX_TOTAL_BYTES / 1048576) + ' MB.');
  const used = new Set<string>();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  let compressedEntries = 0;
  for (const input of inputs) {
    const name = safeEntryName(input.name);
    if (!name) throw new ZipError('Há um arquivo com nome inválido.');
    if (used.has(name.toLowerCase())) throw new ZipError('Dois arquivos com o mesmo nome: ' + name + '.');
    used.add(name.toLowerCase());
    const nameBytes = enc.encode(name);
    let method = 0;
    let body = input.data;
    if (options.compress && canCompress() && input.data.length > 0) {
      const packed = await deflateRaw(input.data);
      if (packed.length < input.data.length) { method = 8; body = packed; compressedEntries++; }
    }
    const crc = crc32(input.data);
    const { time, date } = dosDateTime(input.modified ?? Date.now());
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, method, true);
    lv.setUint16(10, time, true); lv.setUint16(12, date, true); lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true); lv.setUint32(22, input.data.length, true); lv.setUint16(26, nameBytes.length, true); lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    const head = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(head.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, method, true);
    cv.setUint16(12, time, true); cv.setUint16(14, date, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true); cv.setUint32(24, input.data.length, true); cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    head.set(nameBytes, 46);
    parts.push(local, body);
    central.push(head);
    offset += local.length + body.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, inputs.length, true); ev.setUint16(10, inputs.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  const size = offset + cdSize + end.length;
  if (size >= 0xffffffff) throw new ZipError('O ZIP passaria de 4 GB.');
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const p of [...parts, ...central, end]) { bytes.set(p, at); at += p.length; }
  return { bytes, files: inputs.length, storedBytes: total, compressedEntries };
}

// ------------------------------------------------------------ ler
export interface ZipEntry {
  name: string;
  /** Nome como está no arquivo, antes da limpeza. */
  rawName: string;
  directory: boolean;
  method: number;
  compressedSize: number;
  size: number;
  crc: number;
  modified: number;
  offset: number;
  unsafe: boolean;
}
export interface ZipListing { entries: ZipEntry[]; totalSize: number }

const u16 = (v: DataView, o: number): number => v.getUint16(o, true);
const u32 = (v: DataView, o: number): number => v.getUint32(o, true);
function decodeName(raw: Uint8Array, utf8: boolean): string {
  if (utf8) return new TextDecoder('utf-8').decode(raw);
  let s = ''; for (const b of raw) s += String.fromCharCode(b);
  return s;
}
function dosToMs(time: number, date: number): number {
  const year = 1980 + (date >> 9), month = ((date >> 5) & 15) - 1, day = date & 31;
  const t = new Date(year, month < 0 ? 0 : month, day || 1, (time >> 11) & 31, (time >> 5) & 63, (time & 31) * 2).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Lê o índice do .zip (nada é descompactado aqui). Lança ZipError com mensagem clara se o arquivo não servir. */
export function listZip(bytes: Uint8Array): ZipListing {
  if (bytes.length < 22) throw new ZipError('Este arquivo não é um ZIP válido (muito pequeno).');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (u32(view, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ZipError('Este arquivo não é um ZIP válido (índice não encontrado).');
  const count = u16(view, eocd + 10), cdSize = u32(view, eocd + 12), cdOffset = u32(view, eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new ZipError('ZIP64 (arquivos acima de 4 GB) não é suportado.');
  if (count > MAX_ENTRIES) throw new ZipError('O ZIP tem mais de ' + MAX_ENTRIES + ' itens, acima do limite.');
  if (cdOffset + cdSize > eocd) throw new ZipError('O ZIP está corrompido (índice fora do lugar).');
  const entries: ZipEntry[] = [];
  let p = cdOffset;
  let totalSize = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || u32(view, p) !== 0x02014b50) throw new ZipError('O ZIP está corrompido (item ' + (n + 1) + ' ilegível).');
    const flags = u16(view, p + 8), method = u16(view, p + 10);
    const nameLen = u16(view, p + 28), extraLen = u16(view, p + 30), commentLen = u16(view, p + 32);
    if (p + 46 + nameLen > bytes.length) throw new ZipError('O ZIP está corrompido (nome fora do lugar).');
    if (flags & 1) throw new ZipError('Este ZIP tem arquivos protegidos por senha. Não há suporte a senha.');
    const compressedSize = u32(view, p + 20), size = u32(view, p + 24);
    if (compressedSize === 0xffffffff || size === 0xffffffff) throw new ZipError('ZIP64 (arquivos acima de 4 GB) não é suportado.');
    const rawName = decodeName(bytes.subarray(p + 46, p + 46 + nameLen), (flags & 0x0800) !== 0);
    const directory = /[/\\]$/.test(rawName);
    const name = safeEntryName(rawName);
    const unsafe = rawName.replace(/\\/g, '/').split('/').some((s) => s === '..') || /^([/\\]|[a-zA-Z]:)/.test(rawName);
    if (size > MAX_ENTRY_BYTES) throw new ZipError('“' + (name || rawName).slice(0, 60) + '” passa de ' + Math.round(MAX_ENTRY_BYTES / 1048576) + ' MB descompactado.');
    totalSize += size;
    if (totalSize > MAX_TOTAL_BYTES) throw new ZipError('O conteúdo do ZIP passa de ' + Math.round(MAX_TOTAL_BYTES / 1048576) + ' MB descompactado.');
    entries.push({ name, rawName, directory, method, compressedSize, size, crc: u32(view, p + 16), modified: dosToMs(u16(view, p + 12), u16(view, p + 14)), offset: u32(view, p + 42), unsafe });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { entries, totalSize };
}

/** Descompacta um item e confere tamanho e CRC-32. */
export async function extractEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  if (entry.directory) return new Uint8Array(0);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const at = entry.offset;
  if (at + 30 > bytes.length || u32(view, at) !== 0x04034b50) throw new ZipError('“' + entry.name + '” está corrompido (cabeçalho ausente).');
  const start = at + 30 + u16(view, at + 26) + u16(view, at + 28);
  const end = start + entry.compressedSize;
  if (end > bytes.length) throw new ZipError('“' + entry.name + '” está corrompido (dados cortados).');
  const raw = bytes.subarray(start, end);
  let out: Uint8Array;
  if (entry.method === 0) {
    if (raw.length !== entry.size) throw new ZipError('“' + entry.name + '” está corrompido (tamanho diferente).');
    out = raw.slice();
  } else if (entry.method === 8) {
    if (!canDecompress()) throw new ZipError('Este navegador não consegue descompactar ZIP. Atualize o navegador.');
    out = await inflateRaw(raw, entry.size);
  } else throw new ZipError('“' + entry.name + '” usa um método de compressão sem suporte (' + entry.method + ').');
  if (out.length !== entry.size) throw new ZipError('“' + entry.name + '” está corrompido (tamanho diferente do informado).');
  if (crc32(out) !== entry.crc) throw new ZipError('“' + entry.name + '” está corrompido (CRC-32 não confere).');
  return out;
}
