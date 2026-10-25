import { describe, expect, it } from 'vitest';
import { detectKind, extensionOf, looksLikeText, mimeFor, sniff } from './kinds';
import { countLines, decodeText, emptyViewer, hexDump, MAX_FILES, MAX_TEXT_BYTES, normalizeViewer, prettyJson } from './model';

const bytes = (...v: number[]): Uint8Array => Uint8Array.from(v);
const ascii = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('Visualizador · tipo do arquivo', () => {
  it('reconhece pelos primeiros bytes, mesmo com nome errado', () => {
    expect(detectKind('foto.txt', bytes(0x89, 0x50, 0x4e, 0x47, 13, 10))).toBe('image');
    expect(detectKind('x.bin', bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image');
    expect(detectKind('x', ascii('GIF89a......'))).toBe('image');
    expect(detectKind('doc.dat', ascii('%PDF-1.7\n'))).toBe('pdf');
    expect(detectKind('m.bin', ascii('glTF\u0002\u0000\u0000\u0000'))).toBe('model');
    expect(detectKind('x.bin', bytes(0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d))).toBe('video');
    expect(detectKind('x.bin', bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe('video');
    expect(detectKind('x.bin', ascii('RIFF....WAVEfmt '))).toBe('audio');
    expect(detectKind('x.bin', ascii('RIFF....WEBPVP8 '))).toBe('image');
    expect(detectKind('x.bin', ascii('ID3\u0004'))).toBe('audio');
  });
  it('sem assinatura, usa a extensão; STL e OBJ são modelos; ogg depende do nome', () => {
    expect(detectKind('peça.stl', ascii('solid x'))).toBe('model');
    expect(detectKind('cubo.OBJ', ascii('v 0 0 0'))).toBe('model');
    expect(detectKind('som.ogg', ascii('OggS\u0000\u0002'))).toBe('audio');
    expect(detectKind('filme.ogv', ascii('OggS\u0000\u0002'))).toBe('video');
    expect(detectKind('a.mp3', ascii('sem etiqueta'))).toBe('audio');
  });
  it('SVG: pela extensão ou pelo conteúdo', () => {
    expect(detectKind('logo.svg', ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe('svg');
    expect(detectKind('sem-ext', ascii('<?xml version="1.0"?>\n<svg width="1"/>'))).toBe('svg');
  });
  it('texto só se parecer texto; binário desconhecido não vira texto', () => {
    expect(detectKind('nota.txt', ascii('olá mundo\n'))).toBe('text');
    expect(detectKind('nota.txt', bytes(0, 1, 2, 3, 0, 0, 0, 0))).toBe('unknown');
    expect(detectKind('dados', bytes(0, 1, 2, 3, 0, 0, 0, 0))).toBe('unknown');
    expect(detectKind('sem-extensao', ascii('apenas texto simples'))).toBe('text');
    expect(detectKind('vazio.bin', bytes())).toBe('unknown');
    expect(looksLikeText(bytes(9, 10, 13, 65))).toBe(true);
    expect(looksLikeText(bytes(1, 2, 3, 4, 5))).toBe(false);
  });
  it('sniff e utilidades', () => {
    expect(sniff(ascii('nada'))).toBeNull();
    expect(extensionOf('a.b.PNG')).toBe('png');
    expect(extensionOf('semponto')).toBe('');
    expect(mimeFor('svg', 'a.svg', '')).toBe('image/svg+xml');
    expect(mimeFor('image', 'a.png', 'application/octet-stream')).toBe('image/png');
    expect(mimeFor('video', 'a.mp4', 'video/mp4')).toBe('video/mp4');
    expect(mimeFor('unknown', 'a.xyz', '')).toBe('application/octet-stream');
  });
});

describe('Visualizador · modelo e texto', () => {
  it('normaliza projeto: descarta lixo, repetidos e ids inválidos; escolhe um arquivo ativo válido', () => {
    const s = normalizeViewer({ name: 7, files: [
      { id: 'a', name: 'um.txt', kind: 'text', mime: 'text/plain', size: 3, blobId: 'b1' },
      { id: 'a', name: 'repetido', kind: 'text', blobId: 'b2' },
      { id: 'sem blob', name: 'x', kind: 'text', blobId: 'b3' },
      { id: 'c', name: 'c', kind: 'text', blobId: '' },
      { id: 'd', name: '', kind: 'inventado', size: -5, blobId: 'b4' },
      null, 4
    ], activeId: 'zzz' });
    expect(s.files.map((f) => f.id)).toEqual(['a', 'd']);
    expect(s.files[1]).toMatchObject({ kind: 'unknown', size: 0, name: 'arquivo' });
    expect(s.activeId).toBe('a');
    expect(s.name).toBe('Arquivos para visualizar');
    expect(normalizeViewer(emptyViewer())).toEqual(emptyViewer());
    expect(normalizeViewer({ files: Array.from({ length: 50 }, (_, i) => ({ id: 'f' + i, blobId: 'b' + i, kind: 'text' })) }).files).toHaveLength(MAX_FILES);
  });
  it('decodifica UTF-8, BOM e cai para Latin-1', () => {
    expect(decodeText(ascii('olá')).text).toBe('olá');
    expect(decodeText(Uint8Array.from([0xef, 0xbb, 0xbf, 0x61])).text).toBe('a');
    const latin = decodeText(Uint8Array.from([0x6f, 0x6c, 0xe1]));
    expect(latin).toMatchObject({ text: 'olá', encoding: 'Latin-1' });
  });
  it('corta arquivos grandes sem quebrar um caractere no meio', () => {
    const big = new Uint8Array(MAX_TEXT_BYTES + 10).fill(0x61);
    big[MAX_TEXT_BYTES - 1] = 0xc3; big[MAX_TEXT_BYTES] = 0xa1; // "á" atravessa o corte
    const r = decodeText(big);
    expect(r.truncated).toBe(true);
    expect(r.encoding).toBe('UTF-8');
    expect(r.text.length).toBeLessThanOrEqual(MAX_TEXT_BYTES);
  });
  it('JSON bonito, linhas e hexadecimal', () => {
    expect(prettyJson('{"a":[1,2]}')).toBe('{\n  "a": [\n    1,\n    2\n  ]\n}');
    expect(prettyJson('{quebrado')).toBeNull();
    expect(countLines('a\nb\nc')).toBe(3);
    expect(countLines('')).toBe(1);
    expect(hexDump(ascii('ABC\n'))).toBe('00000000  41 42 43 0a                                      ABC.');
    expect(hexDump(new Uint8Array(1000), 32).split('\n')).toHaveLength(2);
  });
});
