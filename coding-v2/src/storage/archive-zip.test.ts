import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { randomBytes, webcrypto } from 'node:crypto';
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'node:util';
import { buildZipBackup, decodeZipBackup, looksLikeZip, BATCH_SIZE } from './archive-zip';
import { buildZip, extractEntry, listZip, ZipError } from '../apps/zip/zip';
import type { CopyRecord } from './documents';

beforeAll(() => {
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('File', NodeFile);
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('TextEncoder', NodeTextEncoder);
  vi.stubGlobal('TextDecoder', NodeTextDecoder);
});
afterAll(() => vi.unstubAllGlobals());

const makeCopy = (id: string, type = 'labels', images: Uint8Array[] = []): CopyRecord => ({
  id, legacyId: 'v2-' + type + '-' + id, source: 'v2', label: 'Projeto ' + id,
  revision: 2, createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_100,
  snapshot: {
    source: 'v2', doc: { id: 'v2-' + type + '-' + id, type, state: { name: 'Projeto ' + id, nota: 'ç ã é 🙂' } },
    images: images.map((bytes, n) => ({ id: 'img-' + n, docId: 'v2-' + type + '-' + id, mime: 'image/png', blob: new NodeBlob([new Uint8Array(bytes)], { type: 'image/png' }) as unknown as Blob }))
  }
});

type Files = Map<string, Uint8Array>;
async function unpack(bytes: Uint8Array): Promise<Files> {
  const files: Files = new Map();
  for (const e of listZip(bytes).entries) files.set(e.rawName, await extractEntry(bytes, e));
  return files;
}
async function repack(files: Files): Promise<Uint8Array> {
  return (await buildZip([...files].map(([name, data]) => ({ name, data })), { compress: false })).bytes;
}
async function tamper(bytes: Uint8Array, change: (files: Files) => void): Promise<Uint8Array> {
  const files = await unpack(bytes);
  change(files);
  return repack(files);
}
const text = (b: Uint8Array): string => new NodeTextDecoder().decode(b);
const json = (b: Uint8Array): Record<string, unknown> => JSON.parse(text(b)) as Record<string, unknown>;
const bytes = (s: string): Uint8Array => new NodeTextEncoder().encode(s);
const photo = randomBytes(5000);

async function good(): Promise<Uint8Array> {
  return (await buildZipBackup([makeCopy('a', 'labels', [photo]), makeCopy('b', 'texts'), makeCopy('c', 'images', [randomBytes(300), randomBytes(40)])])).bytes;
}

describe('backup em ZIP · ida e volta', () => {
  it('guarda manifesto, leia-me, lote e imagens; volta idêntico, inclusive os bytes das imagens', async () => {
    const zip = await good();
    expect(looksLikeZip(zip)).toBe(true);
    const files = await unpack(zip);
    expect([...files.keys()].sort()).toEqual(['LEIAME.txt', 'documentos/lote-0001.json', 'imagens/000001.bin', 'imagens/000002.bin', 'imagens/000003.bin', 'manifesto.json']);
    const manifest = json(files.get('manifesto.json')!);
    expect(manifest).toMatchObject({ format: 'coding-v2-zip-backup', version: 1, total: 3, byApp: { labels: 1, texts: 1, images: 1 } });
    const back = await decodeZipBackup(zip);
    expect(back.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(back[0]!.label).toBe('Projeto a');
    expect((back[0]!.snapshot.doc.state as { nota: string }).nota).toBe('ç ã é 🙂');
    expect(new Uint8Array(await back[0]!.snapshot.images[0]!.blob!.arrayBuffer())).toEqual(new Uint8Array(photo));
    expect(back[2]!.snapshot.images).toHaveLength(2);
  });
  it('250 projetos viram 3 lotes (100 por arquivo), longe do limite de itens do ZIP', async () => {
    const copies = Array.from({ length: 250 }, (_, i) => makeCopy('m' + i));
    const built = await buildZipBackup(copies);
    expect(BATCH_SIZE).toBe(100);
    expect(built.files).toBe(2 + 3);
    expect((await decodeZipBackup(built.bytes))).toHaveLength(250);
  });
  it('exportar nada ou ids repetidos é recusado', async () => {
    await expect(buildZipBackup([])).rejects.toThrow(/Não há projetos/);
    await expect(buildZipBackup([makeCopy('x'), makeCopy('x')])).rejects.toThrow(/repetidos/);
  });
});

describe('backup em ZIP · arquivos hostis ou danificados', () => {
  it('não é ZIP, ou está truncado', async () => {
    await expect(decodeZipBackup(randomBytes(2000))).rejects.toThrow(ZipError);
    const zip = await good();
    await expect(decodeZipBackup(zip.slice(0, zip.length - 40))).rejects.toThrow(ZipError);
  });
  it('ZIP comum sem manifesto', async () => {
    const zip = await repack(new Map([['qualquer.txt', bytes('oi')]]));
    await expect(decodeZipBackup(zip)).rejects.toThrow(/inesperado|manifesto/);
  });
  it('versão futura do formato é recusada com mensagem clara', async () => {
    const zip = await tamper(await good(), (f) => { const m = json(f.get('manifesto.json')!); m.version = 2; f.set('manifesto.json', bytes(JSON.stringify(m))); });
    await expect(decodeZipBackup(zip)).rejects.toThrow(/Versão de backup ZIP não suportada/);
  });
  it('manifesto adulterado: formato errado, ilegível, ids repetidos, total errado', async () => {
    const wrong = await tamper(await good(), (f) => { const m = json(f.get('manifesto.json')!); m.format = 'outro'; f.set('manifesto.json', bytes(JSON.stringify(m))); });
    await expect(decodeZipBackup(wrong)).rejects.toThrow(/não é um backup/);
    const broken = await tamper(await good(), (f) => f.set('manifesto.json', bytes('{ isto não é json')));
    await expect(decodeZipBackup(broken)).rejects.toThrow(/ilegível|corrompido/);
    const dup = await tamper(await good(), (f) => { const m = json(f.get('manifesto.json')!) as { documents: { id: string }[] }; m.documents[1]!.id = m.documents[0]!.id; f.set('manifesto.json', bytes(JSON.stringify(m))); });
    await expect(decodeZipBackup(dup)).rejects.toThrow(/repete o identificador/);
    const total = await tamper(await good(), (f) => { const m = json(f.get('manifesto.json')!); m.total = 99; f.set('manifesto.json', bytes(JSON.stringify(m))); });
    await expect(decodeZipBackup(total)).rejects.toThrow(/quantidade de projetos inválida/);
  });
  it('imagem trocada (mesmo tamanho) falha no SHA-256, sem restauração parcial', async () => {
    const zip = await tamper(await good(), (f) => { const img = f.get('imagens/000001.bin')!; img[0] = img[0]! ^ 0xff; });
    await expect(decodeZipBackup(zip)).rejects.toThrow(/SHA-256/);
  });
  it('lote de documentos alterado falha no SHA-256', async () => {
    const zip = await tamper(await good(), (f) => { const t = text(f.get('documentos/lote-0001.json')!).replace('Projeto a', 'Projeto z'); f.set('documentos/lote-0001.json', bytes(t)); });
    await expect(decodeZipBackup(zip)).rejects.toThrow(/SHA-256|alterado/);
  });
  it('arquivo extra não listado, imagem faltando e nome fora do padrão são recusados', async () => {
    const extra = await tamper(await good(), (f) => f.set('imagens/000099.bin', bytes('x')));
    await expect(decodeZipBackup(extra)).rejects.toThrow(/não listado/);
    const missing = await tamper(await good(), (f) => f.delete('imagens/000002.bin'));
    await expect(decodeZipBackup(missing)).rejects.toThrow(/Falta o arquivo/);
    const odd = await tamper(await good(), (f) => f.set('pasta/escondido.exe', bytes('MZ')));
    await expect(decodeZipBackup(odd)).rejects.toThrow(/inesperado/);
  });
  it('caminho com .. (path traversal) é recusado', async () => {
    const zip = await good();
    // Troca "LEIAME.txt" (10 letras) por "../AAAA.tx" no cabeçalho local e no índice central.
    const from = bytes('LEIAME.txt'), to = bytes('../AAAA.tx');
    const patched = zip.slice();
    for (let i = 0; i + from.length <= patched.length; i++) if (from.every((b, k) => patched[i + k] === b)) patched.set(to, i);
    await expect(decodeZipBackup(patched)).rejects.toThrow(/perigoso/);
  });
  it('bomba de descompactação: tamanho declarado acima do limite é recusado antes de descompactar', async () => {
    const zip = (await good()).slice();
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    for (let i = 0; i + 46 < zip.length; i++) if (view.getUint32(i, true) === 0x02014b50) { view.setUint32(i + 24, 150 * 1024 * 1024, true); break; }
    await expect(decodeZipBackup(zip)).rejects.toThrow(/MB|descompactado/);
  });
  it('id de projeto repetido entre lotes é recusado', async () => {
    const built = await buildZipBackup(Array.from({ length: 101 }, (_, i) => makeCopy('d' + i)));
    const zip = await tamper(built.bytes, (f) => {
      const m = json(f.get('manifesto.json')!) as { batches: { ids: string[] }[]; documents: { id: string }[] };
      m.batches[1]!.ids[0] = 'd0'; // o lote 2 passa a declarar um id que já existe no lote 1
      f.set('manifesto.json', bytes(JSON.stringify(m)));
    });
    await expect(decodeZipBackup(zip)).rejects.toThrow(/não conferem|repete/);
  });
});
