/**
 * Capa embutida em arquivos de áudio. Suporta MP3 (etiqueta ID3v2.3 e 2.4, quadro APIC) e FLAC (bloco PICTURE).
 * Só devolve imagens JPEG ou PNG reconhecidas pelos primeiros bytes; o resto é ignorado (nada de formatos estranhos na tela).
 */
export interface Cover { mime: 'image/jpeg' | 'image/png'; bytes: Uint8Array }

const MAX_TAG_BYTES = 12 * 1024 * 1024;

function sniffImage(bytes: Uint8Array): Cover['mime'] | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  return null;
}
const syncsafe = (b: Uint8Array, at: number): number => ((b[at]! & 0x7f) << 21) | ((b[at + 1]! & 0x7f) << 14) | ((b[at + 2]! & 0x7f) << 7) | (b[at + 3]! & 0x7f);
const be32 = (b: Uint8Array, at: number): number => ((b[at]! * 0x1000000) + ((b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!)) >>> 0;
const ascii = (b: Uint8Array, at: number, n: number): string => String.fromCharCode(...Array.from(b.subarray(at, at + n)));

/** Tamanho total (cabeçalho + conteúdo) da etiqueta ID3v2 que começa em `head`, ou 0 se não houver. */
export function id3TotalSize(head: Uint8Array): number {
  if (head.length < 10 || ascii(head, 0, 3) !== 'ID3') return 0;
  const major = head[3]!;
  if (major !== 3 && major !== 4) return 0;
  const size = syncsafe(head, 6);
  return Math.min(MAX_TAG_BYTES, 10 + size);
}

/** Procura o quadro APIC numa etiqueta ID3v2.3/2.4 já lida por inteiro. */
export function coverFromId3(tag: Uint8Array): Cover | null {
  if (tag.length < 10 || ascii(tag, 0, 3) !== 'ID3') return null;
  const major = tag[3]!, flags = tag[5]!;
  let pos = 10;
  if (flags & 0x40) { // cabeçalho estendido
    if (tag.length < 14) return null;
    pos += major === 4 ? syncsafe(tag, 10) : 4 + be32(tag, 10);
  }
  while (pos + 10 <= tag.length) {
    const id = ascii(tag, pos, 4);
    if (!/^[A-Z0-9]{4}$/.test(id)) break; // chegou ao preenchimento
    const size = major === 4 ? syncsafe(tag, pos + 4) : be32(tag, pos + 4);
    const start = pos + 10, end = start + size;
    if (size <= 0 || end > tag.length) break;
    if (id === 'APIC') {
      const cover = parseApic(tag.subarray(start, end));
      if (cover) return cover;
    }
    pos = end;
  }
  return null;
}

function parseApic(body: Uint8Array): Cover | null {
  if (body.length < 8) return null;
  const encoding = body[0]!;
  let i = 1;
  while (i < body.length && body[i] !== 0) i++; // tipo MIME (Latin-1, termina em zero)
  i += 1;      // zero do MIME
  i += 1;      // tipo da imagem
  const wide = encoding === 1 || encoding === 2; // descrição em UTF-16 termina com dois zeros alinhados
  if (wide) { while (i + 1 < body.length && !(body[i] === 0 && body[i + 1] === 0)) i += 2; i += 2; }
  else { while (i < body.length && body[i] !== 0) i++; i += 1; }
  if (i >= body.length) return null;
  const bytes = body.subarray(i);
  const mime = sniffImage(bytes);
  return mime ? { mime, bytes: bytes.slice() } : null;
}

/** Procura o bloco PICTURE de um arquivo FLAC lido do início (marca "fLaC" e blocos de metadados). */
export function coverFromFlac(file: Uint8Array): Cover | null {
  if (file.length < 8 || ascii(file, 0, 4) !== 'fLaC') return null;
  let pos = 4;
  while (pos + 4 <= file.length) {
    const header = file[pos]!;
    const last = (header & 0x80) !== 0, type = header & 0x7f;
    const len = (file[pos + 1]! << 16) | (file[pos + 2]! << 8) | file[pos + 3]!;
    const start = pos + 4, end = start + len;
    if (end > file.length) break;
    if (type === 6) {
      const cover = parseFlacPicture(file.subarray(start, end));
      if (cover) return cover;
    }
    if (last) break;
    pos = end;
  }
  return null;
}

function parseFlacPicture(b: Uint8Array): Cover | null {
  if (b.length < 32) return null;
  let i = 4;                          // tipo da imagem
  const mimeLen = be32(b, i); i += 4 + mimeLen;
  if (i + 4 > b.length) return null;
  const descLen = be32(b, i); i += 4 + descLen;
  i += 16;                            // largura, altura, profundidade e cores
  if (i + 4 > b.length) return null;
  const dataLen = be32(b, i); i += 4;
  if (dataLen <= 0 || i + dataLen > b.length) return null;
  const bytes = b.subarray(i, i + dataLen);
  const mime = sniffImage(bytes);
  return mime ? { mime, bytes: bytes.slice() } : null;
}

/** Lê só o começo do arquivo (nunca o arquivo inteiro) e procura a capa. Nunca lança: sem capa devolve `null`. */
export async function coverFromBlob(blob: Blob): Promise<Cover | null> {
  try {
    const head = new Uint8Array(await blob.slice(0, 10).arrayBuffer());
    const id3 = id3TotalSize(head);
    if (id3) return coverFromId3(new Uint8Array(await blob.slice(0, id3).arrayBuffer()));
    if (ascii(head, 0, 4) === 'fLaC') return coverFromFlac(new Uint8Array(await blob.slice(0, MAX_TAG_BYTES).arrayBuffer()));
  } catch { /* sem capa */ }
  return null;
}
