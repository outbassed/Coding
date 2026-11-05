import { describe, expect, it } from 'vitest';
import { coverFromBlob, coverFromFlac, coverFromId3, id3TotalSize } from './cover';

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];
const text = (s: string): number[] => Array.from(new TextEncoder().encode(s));
const syncsafe = (n: number): number[] => [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f];
const be32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

function apic(encoding: number, mime: string, description: number[], data: number[]): number[] {
  const terminator = encoding === 1 || encoding === 2 ? [0, 0] : [0];
  return [encoding, ...text(mime), 0, 3, ...description, ...terminator, ...data];
}
function id3(major: 3 | 4, body: number[], extra: number[] = []): Uint8Array {
  const size = body.length;
  const frame = [...text('APIC'), ...(major === 4 ? syncsafe(size) : be32(size)), 0, 0, ...body];
  const frames = [...extra, ...frame];
  return Uint8Array.from([...text('ID3'), major, 0, 0, ...syncsafe(frames.length), ...frames]);
}

describe('Visualizador · capa do áudio (MP3)', () => {
  it('lê a capa JPEG de uma etiqueta ID3v2.4', () => {
    const cover = coverFromId3(id3(4, apic(0, 'image/jpeg', text('capa'), JPEG)));
    expect(cover?.mime).toBe('image/jpeg');
    expect(Array.from(cover!.bytes)).toEqual(JPEG);
  });
  it('lê a capa PNG de uma etiqueta ID3v2.3', () => {
    const cover = coverFromId3(id3(3, apic(0, 'image/png', [], PNG)));
    expect(cover?.mime).toBe('image/png');
    expect(Array.from(cover!.bytes)).toEqual(PNG);
  });
  it('entende a descrição em UTF-16', () => {
    const cover = coverFromId3(id3(4, apic(1, 'image/jpeg', [0xff, 0xfe, 0x41, 0x00], JPEG)));
    expect(cover?.mime).toBe('image/jpeg');
    expect(Array.from(cover!.bytes)).toEqual(JPEG);
  });
  it('ignora conteúdo que não é JPEG nem PNG', () => {
    expect(coverFromId3(id3(4, apic(0, 'image/jpeg', [], [1, 2, 3, 4, 5, 6, 7, 8])))).toBeNull();
  });
  it('sem etiqueta ID3 não há capa', () => {
    expect(coverFromId3(Uint8Array.from(text('RIFF....WAVE')))).toBeNull();
  });
  it('calcula o tamanho da etiqueta', () => {
    const head = Uint8Array.from([...text('ID3'), 4, 0, 0, ...syncsafe(100)]);
    expect(id3TotalSize(head)).toBe(110);
    expect(id3TotalSize(Uint8Array.from([...text('ID3'), 2, 0, 0, ...syncsafe(100)]))).toBe(0);
    expect(id3TotalSize(Uint8Array.from(text('abcdefghijkl')))).toBe(0);
  });
});

describe('Visualizador · capa do áudio (FLAC)', () => {
  function flac(picture: number[]): Uint8Array {
    const len = picture.length;
    return Uint8Array.from([...text('fLaC'), 0x86, (len >> 16) & 255, (len >> 8) & 255, len & 255, ...picture]);
  }
  const picture = (data: number[]): number[] => [...be32(3), ...be32(9), ...text('image/png'), ...be32(0), ...new Array<number>(16).fill(0), ...be32(data.length), ...data];
  it('lê o bloco PICTURE', () => {
    const cover = coverFromFlac(flac(picture(PNG)));
    expect(cover?.mime).toBe('image/png');
    expect(Array.from(cover!.bytes)).toEqual(PNG);
  });
  it('bloco truncado ou sem imagem válida não gera capa', () => {
    expect(coverFromFlac(flac(picture([1, 2, 3, 4, 5, 6, 7, 8])))).toBeNull();
    expect(coverFromFlac(Uint8Array.from(text('fLaC')))).toBeNull();
    expect(coverFromFlac(Uint8Array.from(text('OggSxxxxxxxx')))).toBeNull();
  });
});

describe('Visualizador · capa a partir do arquivo', () => {
  it('arquivo qualquer não gera capa nem erro', async () => {
    expect(await coverFromBlob(new Blob(['qualquer coisa']))).toBeNull();
  });
});
