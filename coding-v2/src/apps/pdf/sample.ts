import { pdfLib } from './engine';

/** PDF de exemplo gerado na hora (3 páginas), para experimentar sem enviar arquivo. */
export async function samplePdf(): Promise<Uint8Array> {
  const L = await pdfLib() as unknown as {
    PDFDocument: { create(): Promise<{ addPage(s: [number, number]): { drawText(t: string, o: Record<string, unknown>): void; drawRectangle(o: Record<string, unknown>): void }; embedFont(n: string): Promise<unknown>; save(): Promise<Uint8Array>; setTitle(t: string): void }> };
    StandardFonts: Record<string, string>; rgb(r: number, g: number, b: number): unknown;
  };
  const doc = await L.PDFDocument.create();
  doc.setTitle('Exemplo do Editor PDF');
  const bold = await doc.embedFont(L.StandardFonts.HelveticaBold!);
  const font = await doc.embedFont(L.StandardFonts.Helvetica!);
  const texts = [
    ['Relatório de exemplo', 'Página 1 · Capa', 'Use as abas Páginas, Anotar e Dividir para organizar este documento.'],
    ['Resultados', 'Página 2 · Tabela', 'Vendas do trimestre: janeiro R$ 12.400, fevereiro R$ 13.150, março R$ 15.020.'],
    ['Conclusão', 'Página 3 · Final', 'Gire, duplique, reordene ou remova páginas e baixe um PDF novo. O original não muda.']
  ];
  texts.forEach(([title, sub, body], i) => {
    const page = doc.addPage([595.28, 841.89]);
    page.drawRectangle({ x: 0, y: 741, width: 595.28, height: 101, color: L.rgb(0.91, 0.33, 0.35) });
    page.drawText(title!, { x: 48, y: 780, size: 30, font: bold, color: L.rgb(1, 1, 1) });
    page.drawText(sub!, { x: 48, y: 700, size: 16, font: bold, color: L.rgb(0.1, 0.1, 0.15) });
    page.drawText(body!, { x: 48, y: 660, size: 12, font, color: L.rgb(0.2, 0.2, 0.25), maxWidth: 500, lineHeight: 16 });
    for (let k = 0; k < 6; k++) page.drawRectangle({ x: 48, y: 560 - k * 60, width: 499, height: 40, color: L.rgb(0.95 - (i % 2) * 0.03, 0.96, 0.98), borderColor: L.rgb(0.8, 0.82, 0.86), borderWidth: 1 });
    page.drawText(String(i + 1) + ' / 3', { x: 520, y: 30, size: 10, font, color: L.rgb(0.4, 0.4, 0.45) });
  });
  return doc.save();
}
