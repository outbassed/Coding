/**
 * Gerador mínimo de PDF (sem dependências): uma imagem JPEG em tela cheia por folha.
 * A imagem é a própria folha A4 renderizada pelo navegador, então o PDF sai igual à prévia.
 */
export interface PdfPageImage { jpeg: Uint8Array; width: number; height: number }

const MM_TO_PT = 72 / 25.4;
const enc = new TextEncoder();

function utf16Hex(text: string): string {
  let out = 'FEFF';
  for (let i = 0; i < text.length; i += 1) out += text.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return '<' + out + '>';
}

export function buildPdf(pages: readonly PdfPageImage[], widthMm: number, heightMm: number, title = ''): Uint8Array {
  if (!pages.length) throw new Error('Nenhuma folha para gerar.');
  const w = +(widthMm * MM_TO_PT).toFixed(2);
  const h = +(heightMm * MM_TO_PT).toFixed(2);
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: Uint8Array | string): void => { const bytes = typeof data === 'string' ? enc.encode(data) : data; chunks.push(bytes); length += bytes.length; };
  const begin = (num: number): void => { offsets[num] = length; push(num + ' 0 obj\n'); };

  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  // 1 = catálogo, 2 = árvore de páginas, 3 = info; por folha: página, conteúdo, imagem
  const pageNum = (i: number): number => 4 + i * 3;
  begin(1); push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  begin(2); push('<< /Type /Pages /Count ' + pages.length + ' /Kids [' + pages.map((_, i) => pageNum(i) + ' 0 R').join(' ') + '] >>\nendobj\n');
  begin(3); push('<< /Producer (Coding 2.0)' + (title ? ' /Title ' + utf16Hex(title) : '') + ' >>\nendobj\n');
  pages.forEach((page, i) => {
    const n = pageNum(i);
    begin(n);
    push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + w + ' ' + h + '] /Resources << /XObject << /Im0 ' + (n + 2) + ' 0 R >> >> /Contents ' + (n + 1) + ' 0 R >>\nendobj\n');
    const content = 'q ' + w + ' 0 0 ' + h + ' 0 0 cm /Im0 Do Q\n';
    begin(n + 1); push('<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream\nendobj\n');
    begin(n + 2);
    push('<< /Type /XObject /Subtype /Image /Width ' + page.width + ' /Height ' + page.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + page.jpeg.length + ' >>\nstream\n');
    push(page.jpeg);
    push('\nendstream\nendobj\n');
  });
  const total = 4 + pages.length * 3;
  const xref = length;
  let table = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
  for (let n = 1; n < total; n += 1) table += String(offsets[n]).padStart(10, '0') + ' 00000 n \n';
  push(table + 'trailer\n<< /Size ' + total + ' /Root 1 0 R /Info 3 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');

  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}
