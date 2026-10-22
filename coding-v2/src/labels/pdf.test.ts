import { describe, expect, it } from 'vitest';
import { buildPdf } from './pdf';
import { pdfFileName } from './raster';

const jpeg = (n: number) => new Uint8Array([0xff, 0xd8, n, 0xff, 0xd9]);
const text = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');

describe('gerador de PDF', () => {
  const pdf = buildPdf([{ jpeg: jpeg(1), width: 10, height: 14 }, { jpeg: jpeg(2), width: 10, height: 14 }], 210, 297, 'Meu doc');
  const raw = text(pdf);
  it('tem cabeçalho, fim e tamanho A4 em pontos', () => {
    expect(raw.startsWith('%PDF-1.4')).toBe(true);
    expect(raw.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(raw).toContain('/MediaBox [0 0 595.28 841.89]');
  });
  it('paisagem troca largura e altura', () => {
    expect(text(buildPdf([{ jpeg: jpeg(1), width: 1, height: 1 }], 297, 210))).toContain('/MediaBox [0 0 841.89 595.28]');
  });
  it('conta as folhas e guarda os bytes do JPEG inteiros', () => {
    expect(raw).toContain('/Count 2');
    expect((raw.match(/\/Type \/Page \//g) ?? []).length).toBe(2);
    expect(raw).toContain('/Filter /DCTDecode /Length 5');
    expect(raw).toContain('\xff\xd8\x01\xff\xd9');
    expect(raw).toContain('\xff\xd8\x02\xff\xd9');
  });
  it('a tabela xref aponta para cada objeto e startxref para a tabela', () => {
    const start = Number(/startxref\n(\d+)\n/.exec(raw)![1]);
    expect(raw.slice(start, start + 4)).toBe('xref');
    const entries = [...raw.slice(start).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
    expect(entries).toHaveLength(9);
    entries.forEach((offset, i) => expect(raw.slice(offset).startsWith(i + 1 + ' 0 obj')).toBe(true));
  });
  it('o título vai em UTF-16 e sem folhas dá erro claro', () => {
    expect(raw).toContain('/Title <FEFF004D0065');
    expect(() => buildPdf([], 210, 297)).toThrow('Nenhuma folha');
  });
});

describe('nome do arquivo', () => {
  it('tira acentos e símbolos e tem padrão', () => {
    expect(pdfFileName('Etiquetas São João / 2026')).toBe('Etiquetas-Sao-Joao-2026.pdf');
    expect(pdfFileName('   ')).toBe('etiquetas.pdf');
  });
});
