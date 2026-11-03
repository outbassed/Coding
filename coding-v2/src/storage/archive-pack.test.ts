import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { randomBytes, webcrypto, createHash } from 'node:crypto';
import {
  encodeBinaryPackage, decodeBinaryPackage, encodeSafeBackup
} from './archive-pack';
import { decodeBackupEntries } from './archive';
import type { CopyRecord } from './documents';

beforeAll(() => {
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('File', NodeFile);
  vi.stubGlobal('crypto', webcrypto);
});
afterAll(() => vi.unstubAllGlobals());

const makeCopy = (id: string, images: Uint8Array[], source: 'v2' | 'backup' = 'v2'): CopyRecord => ({
  id, legacyId: 'v2-labels-' + id, source, label: 'Etiquetas ' + id,
  revision: 3, createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_100,
  snapshot: {
    source, doc: { id: 'v2-labels-' + id, type: 'labels', state: { name: 'Etiquetas ' + id, code: 'A-123' } },
    images: images.map((bytes, n) => ({
      id: 'photo-' + n, docId: 'v2-labels-' + id,
      blob: new NodeBlob([new Uint8Array(bytes)], { type: 'image/png' }) as unknown as Blob
    }))
  }
});
const sum = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

describe('Fase 4 · pacote binário de backup', () => {
  it('usa JSON v2 para documento pequeno e preserva a origem nativa v2', async () => {
    const original = makeCopy('small', [randomBytes(4096)]);
    const output = await encodeSafeBackup([original]);
    expect(output.kind).toBe('json');
    expect(output.extension).toBe('.json');
    const restored = await decodeBackupEntries(await output.blob.text());
    expect(restored).toHaveLength(1);
    expect(restored[0]?.kind).toBe('copy');
    if (restored[0]?.kind !== 'copy') throw new Error('Esperava uma cópia v2');
    expect(restored[0].copy.source).toBe('v2');
    expect(restored[0].copy.snapshot.source).toBe('v2');
  });

  it('33 MiB aleatórios podem ser exportados e recuperados sem base64', async () => {
    const image = new Uint8Array(randomBytes(33 * 1024 * 1024));
    const record = makeCopy('large-33', [image]);
    const packageFile = await encodeSafeBackup([record]);
    expect(packageFile.kind).toBe('binary');
    expect(packageFile.extension).toBe('.codingpack');
    expect(packageFile.blob.size).toBeGreaterThan(image.byteLength);
    expect(packageFile.blob.size).toBeLessThan(image.byteLength + 128_000);
    const [copy] = await decodeBinaryPackage(packageFile.blob);
    expect(copy.label).toBe(record.label);
    expect(copy.revision).toBe(3);
    expect(copy.source).toBe('v2');
    const output = new Uint8Array(await copy.snapshot.images[0]!.blob!.arrayBuffer());
    expect(output.byteLength).toBe(image.byteLength);
    expect(sum(output)).toBe(sum(image));
  }, 150_000);

  it('duas imagens aleatórias de 25 MiB cabem no pacote, apesar do limite JSON', async () => {
    const first = new Uint8Array(randomBytes(25 * 1024 * 1024));
    const second = new Uint8Array(randomBytes(25 * 1024 * 1024));
    const output = await encodeSafeBackup([makeCopy('two-25', [first, second])]);
    expect(output.kind).toBe('binary');
    const [copy] = await decodeBinaryPackage(output.blob);
    expect(copy.snapshot.images.map((v) => v.id)).toEqual(['photo-0', 'photo-1']);
    expect(sum(new Uint8Array(await copy.snapshot.images[0]!.blob!.arrayBuffer()))).toBe(sum(first));
    expect(sum(new Uint8Array(await copy.snapshot.images[1]!.blob!.arrayBuffer()))).toBe(sum(second));
  }, 150_000);

  it('aceita registros provisórios backup de documentos v2 anteriores', async () => {
    const copy = makeCopy('old', [randomBytes(64)], 'backup');
    const encoded = await encodeBinaryPackage([copy]);
    const [restored] = await decodeBinaryPackage(encoded);
    expect(restored.source).toBe('backup');
    expect(restored.legacyId).toBe('v2-labels-old');
    expect(restored.snapshot.images[0]!.blob!.type).toBe('image/png');
  });

  it('recusa pacote adulterado sem apresentar restauração parcial', async () => {
    const copy = makeCopy('tamper', [randomBytes(5000)]);
    const encoded = await encodeBinaryPackage([copy]);
    const raw = new Uint8Array(await encoded.arrayBuffer());
    raw[raw.length - 200] ^= 0x7f;
    await expect(decodeBinaryPackage(new NodeBlob([raw]) as unknown as Blob)).rejects.toThrow('SHA-256');
  });

  it('recusa pacote truncado e dados extras', async () => {
    const pack = await encodeBinaryPackage([makeCopy('short', [randomBytes(200)])]);
    await expect(decodeBinaryPackage(pack.slice(0, pack.size - 1))).rejects.toThrow('truncado');
    await expect(decodeBinaryPackage(new NodeBlob([new Uint8Array(await pack.arrayBuffer()), new Uint8Array([42])]) as unknown as Blob)).rejects.toThrow('dados inesperados');
  });
});
