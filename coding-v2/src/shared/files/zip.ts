/**
 * ZIP mínimo (leitura e escrita) para XLSX e DOCX, sem dependências.
 * Usa a compressão nativa do navegador (CompressionStream 'deflate-raw') quando existe;
 * sem ela, grava sem compressão (método 0), que todo leitor de ZIP aceita.
 */
export interface ZipEntry { name: string; data: Uint8Array }
export const MAX_ZIP_ENTRIES = 4000;
export const MAX_ZIP_BYTES = 200 * 1024 * 1024;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = (CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xffffffff) >>> 0;
}

async function pipe(data: Uint8Array, stream: { readable: ReadableStream<Uint8Array>; writable: WritableStream<BufferSource> }): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(data.slice()).then(() => writer.close()).catch(() => undefined);
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value); total += value.length;
      if (total > MAX_ZIP_BYTES) throw new Error('Arquivo grande demais para abrir.');
    }
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
}
const canDeflate = (): boolean => typeof CompressionStream === 'function';
const canInflate = (): boolean => typeof DecompressionStream === 'function';

const enc = new TextEncoder();
export const utf8 = (text: string): Uint8Array => enc.encode(text);
export const fromUtf8 = (bytes: Uint8Array): string => new TextDecoder('utf-8').decode(bytes);

export async function writeZip(entries: readonly ZipEntry[], compress = true): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const dosTime = 0, dosDate = (2026 - 1980) << 9 | 1 << 5 | 1;
  for (const entry of entries) {
    const name = utf8(entry.name);
    const crc = crc32(entry.data);
    let method = 0;
    let body = entry.data;
    if (compress && canDeflate() && entry.data.length > 64) {
      const packed = await pipe(entry.data, new CompressionStream('deflate-raw'));
      if (packed.length < entry.data.length) { body = packed; method = 8; }
    }
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, method, true); lv.setUint16(10, dosTime, true); lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, body.length, true); lv.setUint32(22, entry.data.length, true);
    lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true);
    local.set(name, 30);
    parts.push(local, body);
    const dir = new Uint8Array(46 + name.length);
    const dv = new DataView(dir.buffer);
    dv.setUint32(0, 0x02014b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 20, true); dv.setUint16(8, 0x0800, true);
    dv.setUint16(10, method, true); dv.setUint16(12, dosTime, true); dv.setUint16(14, dosDate, true);
    dv.setUint32(16, crc, true); dv.setUint32(20, body.length, true); dv.setUint32(24, entry.data.length, true);
    dv.setUint16(28, name.length, true); dv.setUint32(42, offset, true);
    dir.set(name, 46);
    central.push(dir);
    offset += local.length + body.length;
  }
  const dirSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, dirSize, true); ev.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of all) { out.set(p, at); at += p.length; }
  return out;
}

export class ZipError extends Error { constructor(message: string) { super(message); this.name = 'ZipError'; } }

/** Lê todas as entradas (ou só as que `want` aceitar). Valida tamanhos e CRC. */
export async function readZip(bytes: Uint8Array, want: (name: string) => boolean = () => true): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ZipError('O arquivo não é um pacote ZIP/XLSX válido.');
  const count = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  if (count > MAX_ZIP_ENTRIES) throw new ZipError('O arquivo tem entradas demais.');
  const out = new Map<string, Uint8Array>();
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (ptr + 46 > bytes.length || view.getUint32(ptr, true) !== 0x02014b50) throw new ZipError('Índice do ZIP corrompido.');
    const flags = view.getUint16(ptr + 8, true);
    const method = view.getUint16(ptr + 10, true);
    const crc = view.getUint32(ptr + 16, true);
    const packed = view.getUint32(ptr + 20, true);
    const size = view.getUint32(ptr + 24, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extra = view.getUint16(ptr + 30, true);
    const comment = view.getUint16(ptr + 32, true);
    const localAt = view.getUint32(ptr + 42, true);
    const name = fromUtf8(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    ptr += 46 + nameLen + extra + comment;
    if (!want(name) || name.endsWith('/')) continue;
    if (flags & 1) throw new ZipError('Arquivo protegido por senha não é suportado.');
    total += size;
    if (total > MAX_ZIP_BYTES) throw new ZipError('Conteúdo grande demais para abrir.');
    if (view.getUint32(localAt, true) !== 0x04034b50) throw new ZipError('Entrada do ZIP corrompida.');
    const start = localAt + 30 + view.getUint16(localAt + 26, true) + view.getUint16(localAt + 28, true);
    const raw = bytes.subarray(start, start + packed);
    let data: Uint8Array;
    if (method === 0) data = raw.slice();
    else if (method === 8) {
      if (!canInflate()) throw new ZipError('Este navegador não consegue descompactar o arquivo.');
      data = await pipe(raw.slice(), new DecompressionStream('deflate-raw'));
    } else throw new ZipError('Compressão do arquivo não suportada.');
    if (data.length !== size || crc32(data) !== crc) throw new ZipError('O arquivo está corrompido (verificação falhou).');
    out.set(name, data);
  }
  return out;
}
