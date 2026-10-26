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

  it('espaçamento entre linhas vira w:spacing do parágrafo', async () => {
    const bytes = await buildDocx([{ kind: 'p', style: 'Normal', lineHeight: 1.5, runs: [{ text: 'a' }] }, { kind: 'p', style: 'Normal', runs: [{ text: 'b' }] }], 'Linhas');
    const doc = new TextDecoder().decode((await readZip(bytes)).get('word/document.xml'));
    expect(doc).toContain('<w:spacing w:line="360" w:lineRule="auto"/>');
    expect((doc.match(/<w:spacing /g) ?? []).length).toBe(1);
  });
  it('hiperlink de verdade: relação externa, estilo e escape do endereço', async () => {
    const bytes = await buildDocx([
      { kind: 'p', style: 'Normal', runs: [{ text: 'Visite ' }, { text: 'nosso site', href: 'https://exemplo.com/a?x=1&y=2' }, { text: ' e ' }, { text: 'de novo', href: 'https://exemplo.com/a?x=1&y=2' }] }
    ], 'Links');
    const files = await readZip(bytes);
    const doc = new TextDecoder().decode(files.get('word/document.xml'));
    const rels = new TextDecoder().decode(files.get('word/_rels/document.xml.rels'));
    expect((doc.match(/<w:hyperlink /g) ?? []).length).toBe(2);
    expect(doc).toContain('r:id="rIdLink1"');
    expect(doc).not.toContain('rIdLink2');
    expect(rels).toContain('Id="rIdLink1"');
    expect(rels).toContain('TargetMode="External"');
    expect(rels).toContain('https://exemplo.com/a?x=1&amp;y=2');
    expect(doc).toContain('<w:color w:val="1155CC"/>');
  });
});
