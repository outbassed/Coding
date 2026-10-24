import { describe, expect, it } from 'vitest';
import { crc32, readZip, utf8, writeZip } from './zip';
import { detectDelimiter, parseCsv, toCsv } from './csv';
import { colName, readXlsx, writeXlsx } from './xlsx';

describe('arquivos', () => {
  it('ZIP: CRC e ida e volta com e sem compressão', async () => {
    expect(crc32(utf8('123456789'))).toBe(0xcbf43926);
    const files = [{ name: 'a.txt', data: utf8('olá '.repeat(200)) }, { name: 'pasta/b.bin', data: new Uint8Array([0, 1, 2, 255]) }];
    for (const compress of [true, false]) {
      const back = await readZip(await writeZip(files, compress));
      expect(new TextDecoder().decode(back.get('a.txt'))).toBe('olá '.repeat(200));
      expect([...back.get('pasta/b.bin')!]).toEqual([0, 1, 2, 255]);
    }
    await expect(readZip(utf8('não é zip'))).rejects.toThrow();
  });
  it('CSV: separador, aspas, BOM e proteção contra fórmulas', () => {
    expect(detectDelimiter('a;b\n1;2')).toBe(';');
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t');
    expect(parseCsv('﻿a;b;c\n"x;1";"q""uote";\n\n')).toEqual([['a', 'b', 'c'], ['x;1', 'q"uote', '']]);
    expect(toCsv([['=cmd', '-5', 'a"b']])).toBe('﻿\'=cmd;-5;"a""b"\r\n');
  });
  it('XLSX: grava e lê de volta textos, números, formatos e fórmulas; nomes de aba únicos', async () => {
    const bytes = await writeXlsx([
      { name: 'Orçamento', rows: [[{ value: 'Item', bold: true }, { value: 'Valor' }], [{ value: 'Café & <leite>' }, { value: 12.5, format: 'currency' }], [{ value: 'Total' }, { value: 12.5, formula: 'SUM(B2:B2)' }]] },
      { name: 'Orçamento', rows: [[{ value: 1 }]] }
    ]);
    const back = await readXlsx(bytes);
    expect(back.map((s) => s.name)).toEqual(['Orçamento', 'Orçamento 2']);
    expect(back[0]!.rows[1]![0]!.value).toBe('Café & <leite>');
    expect(back[0]!.rows[1]![1]!.number).toBe(12.5);
    expect(back[0]!.rows[2]![1]!.formula).toBe('SUM(B2:B2)');
    expect(colName(0)).toBe('A'); expect(colName(27)).toBe('AB');
  });
});
