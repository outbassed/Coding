import { describe, expect, it } from 'vitest';
import { mergeBulk, parseBulk } from './bulk';
import { MAX_COPIES, MAX_ITEMS, type LabelItem } from './model';

describe('colar lista: interpretação das linhas', () => {
  it('separa por ponto e vírgula, com descrição e cópias opcionais', () => {
    const r = parseBulk('190847 ; ARVORE ; 4\n250311;PISCA\nSOLTO');
    expect(r.rows.map((x) => [x.code, x.description, x.copies])).toEqual([['190847', 'ARVORE', 4], ['250311', 'PISCA', 1], ['SOLTO', '', 1]]);
    expect(r.totalLabels).toBe(6);
  });
  it('aceita colunas separadas por tab (colado do Excel) e prefere o tab', () => {
    const r = parseBulk('A1\tFio; grosso\t3\r\nB2\t\t2');
    expect(r.rows.map((x) => [x.code, x.description, x.copies])).toEqual([['A1', 'Fio; grosso', 3], ['B2', '', 2]]);
  });
  it('ignora linhas vazias e avisa dos ajustes de cópias', () => {
    const r = parseBulk('\n  \nA;;abc\nB;;0\nC;;9999\nD;x;2;extra');
    expect(r.rows.map((x) => x.copies)).toEqual([1, 1, MAX_COPIES, 2]);
    expect(r.rows[0]!.notes[0]).toContain('inválidas');
    expect(r.rows[1]!.notes[0]).toContain('abaixo de 1');
    expect(r.rows[2]!.notes[0]).toContain('limitadas');
    expect(r.rows[3]!.notes[0]).toContain('ignoradas');
    expect(r.rows[3]!.line).toBe(6);
  });
  it('linha só com separadores não vira item', () => {
    const r = parseBulk(';;3\n;');
    expect(r.rows).toHaveLength(0);
    expect(r.ignored).toBe(2);
  });
  it('corta código e descrição longos avisando', () => {
    const r = parseBulk('x'.repeat(200) + ';' + 'y'.repeat(2100));
    expect(r.rows[0]!.code).toHaveLength(160);
    expect(r.rows[0]!.description).toHaveLength(2000);
    expect(r.rows[0]!.notes).toHaveLength(2);
  });
});

describe('colar lista: junção com os itens atuais', () => {
  const item = (code: string): LabelItem => ({ id: 'i-' + code, code, description: '', copies: 1 });
  const rows = parseBulk('N1;a;2\nN2;b;3').rows;
  it('acrescenta descartando itens vazios', () => {
    const m = mergeBulk([item('A'), item('')], rows, false);
    expect(m.items.map((i) => i.code)).toEqual(['A', 'N1', 'N2']);
    expect(m.added).toBe(2);
    expect(new Set(m.items.map((i) => i.id)).size).toBe(3);
  });
  it('substitui tudo', () => {
    expect(mergeBulk([item('A')], rows, true).items.map((i) => i.code)).toEqual(['N1', 'N2']);
  });
  it('respeita o limite de itens', () => {
    const many = Array.from({ length: MAX_ITEMS - 1 }, (_, i) => item('K' + i));
    const m = mergeBulk(many, rows, false);
    expect(m.items).toHaveLength(MAX_ITEMS);
    expect(m.trimmed).toBe(true);
    expect(m.added).toBe(1);
  });
});
