import { describe, expect, it, vi } from 'vitest';
import { defaultBoxes } from './model';
import {
  boxPages, boxWarning, brasiliaFields, brasiliaStamp, manualStamp,
  readShops, saveShops, shopHeading, stampForPrint, validManual
} from './boxes';

class MemoryStore {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('Caixas · cadastro, páginas e validação', () => {
  it('tem seis lojas cadastradas inicialmente e seleciona Cariacica / Vila Velha', () => {
    const db = new MemoryStore();
    const shops = readShops(db);
    expect(shops.map((s) => s.short)).toEqual(['VILA VELHA', 'CARIACICA', 'SERRA', 'GUARAPARI', 'BARRA', 'CACHOEIRO']);
    expect(shopHeading(defaultBoxes())).toBe('CARIACICA / VILA VELHA');
  });
  it('guarda cadastro editado sem afetar as lojas gravadas no documento', () => {
    const db = new MemoryStore();
    const selected = defaultBoxes();
    const custom = [{ id: 'nova', name: 'Nova Loja', short: 'NOVA' }];
    expect(saveShops(custom, db)).toBe(true);
    expect(readShops(db)).toEqual(custom);
    expect(shopHeading(selected)).toBe('CARIACICA / VILA VELHA');
  });
  it('gera 1/2 e 2/2 e divide lotes maiores em folhas A4 com oito caixas', () => {
    expect(boxPages(2)).toEqual([[1, 2]]);
    expect(boxPages(9)).toEqual([[1,2,3,4,5,6,7,8], [9]]);
    expect(boxPages(17)).toHaveLength(3);
  });
  it('bloqueia dados incompletos e aceita modo manual válido', () => {
    expect(boxWarning(defaultBoxes())).toBe('');
    expect(boxWarning({ ...defaultBoxes(), nf: '123X' })).toContain('somente números');
    expect(boxWarning({ ...defaultBoxes(), stores: [] })).toContain('loja');
    const manual = { ...defaultBoxes(), timeMode: 'manual' as const, manualDate: '2026-11-06', manualTime: '19:00' };
    expect(validManual(manual)).toBe(true);
    expect(manualStamp(manual)).toBe('06/11/2026 19:00');
    expect(validManual({ ...manual, manualDate: '2026-02-30' })).toBe(false);
  });
});

describe('Caixas · hora de impressão', () => {
  it('formatta data e hora no fuso de Brasília', () => {
    const utc = new Date('2026-11-06T21:36:00Z');
    expect(brasiliaStamp(utc)).toBe('06/11/2026 18:36');
    expect(brasiliaFields(utc)).toEqual({ date: '2026-11-06', time: '18:36' });
  });
  it('prioriza Date do servidor online', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, headers: new Headers({ date: 'Fri, 06 Nov 2026 21:36:00 GMT' }) })) as unknown as typeof fetch;
    const result = await stampForPrint(defaultBoxes(), fetcher, () => new Date('2026-11-01T15:00:00Z'));
    expect(result).toEqual({ text: '06/11/2026 18:36', source: 'online' });
    expect(fetcher).toHaveBeenCalledWith('/brand/icon.svg', expect.objectContaining({ method: 'HEAD', cache: 'no-store' }));
  });
  it('usa hora do dispositivo quando sem internet', async () => {
    const fetcher = vi.fn(async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    const result = await stampForPrint(defaultBoxes(), fetcher, () => new Date('2026-11-06T20:40:00Z'));
    expect(result).toEqual({ text: '06/11/2026 17:40', source: 'device' });
  });
  it('no modo manual nunca consulta rede', async () => {
    const boxes = { ...defaultBoxes(), timeMode: 'manual' as const, manualDate: '2026-11-06', manualTime: '14:30' };
    const fetcher = vi.fn() as unknown as typeof fetch;
    expect(await stampForPrint(boxes, fetcher)).toEqual({ text: '06/11/2026 14:30', source: 'manual' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
