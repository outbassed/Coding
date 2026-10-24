import { describe, expect, it } from 'vitest';
import { buildDocx } from './docx';
import { readZip } from '../shared/files/zip';

describe('DOCX', () => {
  it('gera pacote válido com títulos, listas, tabela, quebra de página e imagem', async () => {
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAAQ6QEHXl0X6QAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
    const bytes = await buildDocx([
      { kind: 'p', style: 'Heading1', runs: [{ text: 'Relatório & “teste”' }] },
      { kind: 'p', style: 'Normal', list: { type: 'ol', id: 1 }, runs: [{ text: 'Primeiro', b: true }] },
      { kind: 'table', rows: [{ header: true, cells: [[{ kind: 'p', style: 'Normal', runs: [{ text: 'Item' }] }]] }] },
      { kind: 'p', style: 'Normal', pageBreakBefore: true, runs: [{ image: { data: png, ext: 'png', widthPx: 2, heightPx: 2, percent: 50 } }] }
    ], 'Teste');
    const files = await readZip(bytes);
    const doc = new TextDecoder().decode(files.get('word/document.xml'));
    expect(doc).toContain('Relatório &amp; “teste”');
    expect(doc).toContain('<w:pStyle w:val="Heading1"/>');
    expect(doc).toContain('<w:numId w:val="1"/>');
    expect(doc).toContain('<w:tbl>');
    expect(doc).toContain('<w:pageBreakBefore/>');
    expect(files.has('word/media/image1.png')).toBe(true);
    expect(new TextDecoder().decode(files.get('word/_rels/document.xml.rels'))).toContain('media/image1.png');
  });
});
