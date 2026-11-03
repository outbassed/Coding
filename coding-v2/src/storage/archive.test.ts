import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { TextEncoder } from 'node:util';
import { encodeBackup, encodeCopyBackup, decodeBackup, decodeBackupEntries } from './archive';
import type { CopyRecord, LegacySnapshot } from './documents';

beforeAll(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('File', NodeFile);
  vi.stubGlobal('TextEncoder', TextEncoder);
});
afterAll(() => vi.unstubAllGlobals());

function snapshot(): LegacySnapshot {
  const data: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  data['$codingV2BinaryType'] = 'ordinary user text';
  Object.defineProperty(data, 'constructor', { value: 'a harmless user-defined field', enumerable: true, configurable: true });
  data.different = [undefined, NaN, Infinity, -Infinity, -0];
  data.pixels = new Uint8ClampedArray([0, 1, 2, 250, 255]);
  data.big = new BigInt64Array([17n, -25n]);
  data.map = new Map([['key', new Set([1, 2])]]);
  data.file = new NodeFile(['hello'], 'anexo.txt', { type: 'text/plain', lastModified: 123 });
  return {
    source: 'indexeddb',
    doc: { id: 'original-1', type: 'images', state: { name: 'Foto antiga', ...data } },
    images: [{ id: 'img-1', docId: 'original-1', blob: new NodeBlob([new Uint8Array([0, 1, 2, 250, 255])], { type: 'image/webp' }) as unknown as Blob, mime: 'image/webp' }]
  };
}

describe('Fase 3.1 · backup binário fiel', () => {
  it('faz roundtrip de blob, typed arrays, bigint, nomes e campos reservados', async () => {
    const source = snapshot();
    const text = await encodeBackup([source]);
    const [roundtrip] = await decodeBackup(text);
    expect(roundtrip.source).toBe('indexeddb');
    expect(roundtrip.doc.id).toBe('original-1');
    const state = roundtrip.doc.state as Record<string, unknown>;
    expect(state['$codingV2BinaryType']).toBe('ordinary user text');
    expect(state.constructor).toBe('a harmless user-defined field');
    expect(state.different).toHaveLength(5);
    const specials = state.different as unknown[];
    expect(specials[0]).toBeUndefined();
    expect(Number.isNaN(specials[1])).toBe(true);
    expect(specials[2]).toBe(Infinity);
    expect(specials[3]).toBe(-Infinity);
    expect(Object.is(specials[4], -0)).toBe(true);
    expect([...((state.pixels) as Uint8ClampedArray)]).toEqual([0, 1, 2, 250, 255]);
    expect([...((state.big) as BigInt64Array)]).toEqual([17n, -25n]);
    expect((state.map as Map<string, Set<number>>).get('key')).toEqual(new Set([1, 2]));
    expect((state.file as File).name).toBe('anexo.txt');
    expect(new Uint8Array(await roundtrip.images[0].blob!.arrayBuffer())).toEqual(new Uint8Array([0, 1, 2, 250, 255]));
  });

  it('retém metadados da cópia v2 e sua revisão', async () => {
    const copy: CopyRecord = {
      id: 'copia-123', legacyId: 'original-1', source: 'indexeddb',
      label: 'Renomeado na v2', revision: 7, createdAt: 1700000000000,
      updatedAt: 1700001000000, snapshot: snapshot()
    };
    const text = await encodeCopyBackup([copy]);
    const entries = await decodeBackupEntries(text);
    expect(entries).toHaveLength(1);
    const imported = entries[0];
    expect(imported.kind).toBe('copy');
    if (imported.kind === 'copy') {
      expect(imported.copy.id).toBe('copia-123');
      expect(imported.copy.label).toBe('Renomeado na v2');
      expect(imported.copy.revision).toBe(7);
      expect(imported.copy.source).toBe('indexeddb');
    }
  });

  it('recusa checksum inválido em vez de restaurar anexo corrompido', async () => {
    const text = await encodeBackup([snapshot()]);
    const bad = text.replace('UElYRUxT', 'QUlYRUxT').replace('AAEC+v8=', 'AQEC+v8=');
    expect(bad).not.toBe(text);
    await expect(decodeBackupEntries(bad)).rejects.toThrow();
  });

  it('recusa imagens inválidas sem salvar registros parciais', async () => {
    const v1 = JSON.stringify({
      schema: 'coding-v2-safe-backup', version: 1,
      entries: [{ source: 'backup', doc: { id: 'd' }, images: [1, null] }]
    });
    await expect(decodeBackupEntries(v1)).rejects.toThrow('Imagem inválida');
  });

  it('recusa classe desconhecida, em vez de exportar um objeto vazio', async () => {
    const source = snapshot();
    source.doc.state!.unknown = new (class Custom { value = 5; })();
    await expect(encodeBackup([source])).rejects.toThrow('Objeto complexo não suportado');
  });
});

describe('Fase 3.3 · arquivos maiores que fotos de celular', () => {
  it.each([3, 10, 32])('exporta e restaura um Blob real de %i MiB sem estourar a pilha', async (megabytes) => {
    const size = megabytes * 1024 * 1024;
    const data = new Uint8Array(size);
    data[0] = 17;
    data[size - 1] = 237;
    const photo = snapshot();
    photo.images = [{
      id: 'photo-large', docId: photo.doc.id,
      blob: new NodeBlob([data], { type: 'image/jpeg' }) as unknown as Blob,
      mime: 'image/jpeg'
    }];
    const backup = await encodeBackup([photo]);
    expect(backup.length).toBeGreaterThan(size);
    const [restored] = await decodeBackup(backup);
    expect(restored.images).toHaveLength(1);
    const blob = restored.images[0].blob!;
    expect(blob.size).toBe(size);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(bytes[0]).toBe(17);
    expect(bytes[size - 1]).toBe(237);
  }, 150_000);

  it('rejeita base64 malformado em arquivo v1, sem tentar gravar nada', async () => {
    const bad = JSON.stringify({
      schema: 'coding-v2-safe-backup', version: 1,
      entries: [{
        source: 'backup', doc: { id: 'bad' },
        images: [{ id: 'image', docId: 'bad', blob: {
          $codingV2BinaryType: 'blob', mime: 'image/jpeg', base64: 'AB?='
        } }]
      }]
    });
    await expect(decodeBackupEntries(bad)).rejects.toThrow('Dados binários codificados incorretamente');
  });
});
