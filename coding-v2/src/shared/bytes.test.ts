import { describe, expect, it } from 'vitest';
import { formatBytes, percentOf } from './bytes';

const t = (s: string) => s.replace(/ /g, ' ');
describe('formatBytes', () => {
  it('zero e fronteiras', () => {
    expect(t(formatBytes(0))).toBe('0 B');
    expect(t(formatBytes(1))).toBe('1 B');
    expect(t(formatBytes(1023))).toBe('1.023 B');
    expect(t(formatBytes(1024))).toBe('1,0 KB');
    expect(t(formatBytes(1024 * 1024))).toBe('1,0 MB');
    expect(t(formatBytes(1024 ** 3))).toBe('1,0 GB');
  });
  it('10240,2 MB vira 10,0 GB', () => { expect(t(formatBytes(10240.2 * 1024 * 1024))).toBe('10,0 GB'); });
  it('terabytes e além', () => {
    expect(t(formatBytes(1024 ** 4))).toBe('1,0 TB');
    expect(t(formatBytes(5.5 * 1024 ** 4))).toBe('5,5 TB');
    expect(t(formatBytes(3000 * 1024 ** 4))).toContain('TB');
  });
  it('não arredonda para unidade grande demais', () => { expect(t(formatBytes(1024 * 1024 - 1))).toBe('1,0 MB'); });
  it('uma casa decimal com vírgula', () => { expect(t(formatBytes(1536))).toBe('1,5 KB'); expect(t(formatBytes(5 * 1024 * 1024))).toBe('5,0 MB'); });
  it('valores inválidos', () => {
    for (const bad of [null, undefined, -1, NaN, Infinity]) expect(formatBytes(bad as number)).toBe('não informado');
    expect(formatBytes(null, '—')).toBe('—');
  });
});
describe('percentOf', () => {
  it('seguro', () => {
    expect(percentOf(5, 10)).toBe(50);
    expect(percentOf(20, 10)).toBe(100);
    expect(percentOf(1, 0)).toBeNull();
    expect(percentOf(null, 10)).toBeNull();
    expect(percentOf(-1, 10)).toBeNull();
  });
});
