import { describe, expect, it } from 'vitest';
import { DEFAULT_IMPORT_LIMITS, IMPORT_LIMITS_KEY, MB, checkImport, formatMB, loadImportLimits, normalizeImportLimits, resetImportLimits, saveImportLimits } from './importLimits';
import type { KV } from './prefs';

function memoryKv(): KV & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: (k) => { data.delete(k); }, get length() { return data.size; }, key: (i) => [...data.keys()][i] ?? null };
}

describe('limites de importação', () => {
  it('padrões conservadores e documentados', () => {
    expect(DEFAULT_IMPORT_LIMITS.enabled).toBe(true);
    expect(DEFAULT_IMPORT_LIMITS.audio.max).toBeLessThanOrEqual(150);
    expect(DEFAULT_IMPORT_LIMITS.video.max).toBeLessThanOrEqual(1000);
    expect(DEFAULT_IMPORT_LIMITS.audio.warn).toBeLessThan(DEFAULT_IMPORT_LIMITS.audio.max);
  });
  it('dentro do limite, aviso e bloqueio', () => {
    const l = DEFAULT_IMPORT_LIMITS;
    expect(checkImport('audio', 5 * MB, l).level).toBe('ok');
    expect(checkImport('audio', 30 * MB, l).level).toBe('warn');
    expect(checkImport('audio', 101 * MB, l)).toMatchObject({ level: 'block' });
    expect(checkImport('audio', 101 * MB, l).message).toContain('Ajustes');
    expect(checkImport('video', 400 * MB, l).level).toBe('warn');
    expect(checkImport('video', 501 * MB, l).level).toBe('block');
    expect(checkImport('image', 41 * MB, l).level).toBe('block');
  });
  it('com os limites desligados nada é bloqueado por tamanho', () => {
    const off = { ...DEFAULT_IMPORT_LIMITS, enabled: false };
    expect(checkImport('video', 5000 * MB, off)).toEqual({ level: 'ok', message: '' });
    expect(checkImport('audio', 5000 * MB, off).level).toBe('ok');
  });
  it('valores personalizados valem e o aviso nunca passa do máximo', () => {
    const l = normalizeImportLimits({ audio: { warn: 500, max: 50 } });
    expect(l.audio).toEqual({ warn: 50, max: 50 });
    expect(checkImport('audio', 60 * MB, l).level).toBe('block');
  });
  it('lixo volta aos padrões', () => {
    expect(normalizeImportLimits('x')).toEqual(DEFAULT_IMPORT_LIMITS);
    expect(normalizeImportLimits({ audio: { max: 'a' }, video: null, enabled: 'sim' })).toEqual(DEFAULT_IMPORT_LIMITS);
    expect(normalizeImportLimits({ image: { max: -4 } }).image.max).toBe(1);
  });
  it('grava, lê e restaura', () => {
    const kv = memoryKv();
    expect(saveImportLimits({ ...DEFAULT_IMPORT_LIMITS, enabled: false, audio: { warn: 10, max: 60 } }, kv)).toBe(true);
    expect(loadImportLimits(kv)).toMatchObject({ enabled: false, audio: { warn: 10, max: 60 } });
    expect(resetImportLimits(kv)).toEqual(DEFAULT_IMPORT_LIMITS);
    expect(kv.data.has(IMPORT_LIMITS_KEY)).toBe(false);
  });
  it('armazenamento corrompido ou indisponível não quebra', () => {
    const kv = memoryKv(); kv.setItem(IMPORT_LIMITS_KEY, '{nao-json');
    expect(loadImportLimits(kv)).toEqual(DEFAULT_IMPORT_LIMITS);
    expect(loadImportLimits(null)).toEqual(DEFAULT_IMPORT_LIMITS);
    expect(saveImportLimits(DEFAULT_IMPORT_LIMITS, null)).toBe(false);
  });
  it('formata tamanhos', () => { expect(formatMB(1.5 * MB)).toBe('1,5 MB'); expect(formatMB(250 * MB)).toBe('250 MB'); });
});
