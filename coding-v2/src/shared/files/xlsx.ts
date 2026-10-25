import { readZip, writeZip, utf8, fromUtf8, ZipError } from './zip';
import { allText, child, childrenOf, escapeXml, parseXml, type XNode } from './xml';

/** Estilo de célula/coluna: cor da fonte, preenchimento (#rrggbb), negrito e formato numérico. */
export interface XlsxStyle { bold?: boolean; fg?: string; bg?: string; format?: XlsxFormat }
/** Uma célula lida: valor exibível e fórmula original (sem o "="), quando houver. */
export interface XlsxCell { value: string; formula?: string; number?: number; style?: XlsxStyle }
export interface XlsxSheet { name: string; rows: XlsxCell[][]; /** estilos de coluna inteira (índice da coluna, base 0) */ colStyles?: Record<number, XlsxStyle> }
export const MAX_XLSX_ROWS = 20000;
export const MAX_XLSX_COLS = 200;

export function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
export function colName(index: number): string {
  let n = index + 1, s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

const isXlsx = (bytes: Uint8Array): boolean => bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;

export async function readXlsx(bytes: Uint8Array): Promise<XlsxSheet[]> {
  if (!isXlsx(bytes)) throw new ZipError('Este arquivo não é uma planilha XLSX. Arquivos .xls antigos precisam ser salvos como .xlsx ou .csv.');
  const files = await readZip(bytes, (n) => n.startsWith('xl/') || n === '[Content_Types].xml');
  const wbXml = files.get('xl/workbook.xml');
  if (!wbXml) throw new ZipError('A planilha não tem pastas de trabalho (xl/workbook.xml).');
  const wb = parseXml(fromUtf8(wbXml));
  const rels = new Map<string, string>();
  const relsXml = files.get('xl/_rels/workbook.xml.rels');
  if (relsXml) for (const r of childrenOf(child(parseXml(fromUtf8(relsXml)), 'Relationships'), 'Relationship')) rels.set(r.attrs.Id ?? '', r.attrs.Target ?? '');
  const shared: string[] = [];
  const ssXml = files.get('xl/sharedStrings.xml');
  if (ssXml) for (const si of childrenOf(child(parseXml(fromUtf8(ssXml)), 'sst'), 'si')) shared.push(allText(si));
  const stylesXml = files.get('xl/styles.xml');
  const xfs = stylesXml ? readStyles(parseXml(fromUtf8(stylesXml))) : [];
  const sheetsNode = child(child(wb, 'workbook'), 'sheets');
  const out: XlsxSheet[] = [];
  for (const s of childrenOf(sheetsNode, 'sheet')) {
    let target = rels.get(s.attrs.id ?? '') ?? '';
    target = target.replace(/^\/?xl\//, '').replace(/^\//, '');
    const path = 'xl/' + target;
    const data = files.get(path);
    if (!data) continue;
    const doc = parseXml(fromUtf8(data));
    const sheet: XlsxSheet = { name: s.attrs.name ?? 'Planilha', rows: readSheet(doc, shared, xfs) };
    const colStyles = readColStyles(doc, xfs);
    if (colStyles) sheet.colStyles = colStyles;
    out.push(sheet);
  }
  if (!out.length) throw new ZipError('Nenhuma aba encontrada na planilha.');
  return out;
}

function readSheet(doc: XNode, shared: string[], xfs: (XlsxStyle | undefined)[] = []): XlsxCell[][] {
  const rows: XlsxCell[][] = [];
  const data = child(child(doc, 'worksheet'), 'sheetData');
  let rowIndex = -1;
  for (const r of childrenOf(data, 'row')) {
    rowIndex = r.attrs.r ? Number(r.attrs.r) - 1 : rowIndex + 1;
    if (!Number.isFinite(rowIndex) || rowIndex < 0) continue;
    if (rowIndex >= MAX_XLSX_ROWS) throw new Error('A planilha tem linhas demais (máximo ' + MAX_XLSX_ROWS + ').');
    const row: XlsxCell[] = [];
    let colAt = -1;
    for (const c of childrenOf(r, 'c')) {
      const ref = /^([A-Z]+)\d+$/i.exec(c.attrs.r ?? '');
      colAt = ref ? colIndex(ref[1]!) : colAt + 1;
      if (colAt >= MAX_XLSX_COLS) continue;
      const t = c.attrs.t ?? 'n';
      const v = child(c, 'v')?.text ?? '';
      const f = child(c, 'f')?.text;
      let cell: XlsxCell;
      if (t === 's') cell = { value: shared[Number(v)] ?? '' };
      else if (t === 'inlineStr') cell = { value: allText(child(c, 'is') ?? c) };
      else if (t === 'b') cell = { value: v === '1' ? 'VERDADEIRO' : 'FALSO' };
      else if (t === 'str' || t === 'e') cell = { value: v };
      else { const num = Number(v); cell = v === '' ? { value: '' } : { value: Number.isFinite(num) ? String(num) : v, number: Number.isFinite(num) ? num : undefined }; }
      if (f) cell.formula = f;
      const xf = xfs[Number(c.attrs.s ?? 0)];
      if (xf) cell.style = xf;
      while (row.length < colAt) row.push({ value: '' });
      row[colAt] = cell;
    }
    while (rows.length < rowIndex) rows.push([]);
    rows[rowIndex] = row;
  }
  return rows;
}

// ---- estilos (cor da fonte, preenchimento, negrito, formato) ----
function argb(node: XNode | undefined): string | undefined {
  const rgb = node?.attrs.rgb;
  if (!rgb || !/^([0-9a-f]{6}|[0-9a-f]{8})$/i.test(rgb)) return undefined; // cores de tema ou indexadas não são importadas
  return '#' + rgb.slice(-6).toLowerCase();
}
function formatFromCode(id: number, code: string | undefined): XlsxFormat | undefined {
  const builtin: Record<number, XlsxFormat> = { 1: 'integer', 2: 'number', 3: 'integer', 4: 'number', 9: 'percent', 10: 'percent', 49: 'text' };
  if (builtin[id]) return builtin[id];
  if (!code) return undefined;
  if (code === '@') return 'text';
  if (code.includes('%')) return 'percent';
  if (/R\$|\[\$|\$/.test(code)) return 'currency';
  if (/^[#,.0\s]+$/.test(code)) return /[.,]0{1,}$/.test(code.trim()) && /0[.,]0/.test(code) ? 'number' : 'integer';
  return undefined;
}
/** Lê styles.xml e devolve, para cada índice de estilo (atributo s), o estilo visual aproveitável. */
export function readStyles(doc: XNode): (XlsxStyle | undefined)[] {
  const root = child(doc, 'styleSheet');
  const numFmts = new Map<number, string>();
  for (const n of childrenOf(child(root, 'numFmts'), 'numFmt')) numFmts.set(Number(n.attrs.numFmtId), n.attrs.formatCode ?? '');
  const fonts = childrenOf(child(root, 'fonts'), 'font').map((f) => ({ bold: !!child(f, 'b') && child(f, 'b')?.attrs.val !== '0', fg: argb(child(f, 'color')) }));
  const fills = childrenOf(child(root, 'fills'), 'fill').map((f) => {
    const p = child(f, 'patternFill');
    return p?.attrs.patternType === 'solid' ? argb(child(p, 'fgColor')) : undefined;
  });
  return childrenOf(child(root, 'cellXfs'), 'xf').map((xf) => {
    const font = fonts[Number(xf.attrs.fontId ?? 0)];
    const bg = fills[Number(xf.attrs.fillId ?? 0)];
    const id = Number(xf.attrs.numFmtId ?? 0);
    const format = formatFromCode(id, numFmts.get(id));
    const style: XlsxStyle = {};
    if (font?.bold) style.bold = true;
    // Fonte preta explícita sem preenchimento é o "automático" do Excel: não vira cor fixa (ficaria ilegível no tema escuro).
    if (font?.fg && !(font.fg === '#000000' && !bg)) style.fg = font.fg;
    if (bg) style.bg = bg;
    if (format) style.format = format;
    return Object.keys(style).length ? style : undefined;
  });
}
function readColStyles(doc: XNode, xfs: (XlsxStyle | undefined)[]): Record<number, XlsxStyle> | undefined {
  const out: Record<number, XlsxStyle> = {};
  for (const col of childrenOf(child(child(doc, 'worksheet'), 'cols'), 'col')) {
    const style = xfs[Number(col.attrs.style ?? 0)];
    if (!style || (!style.fg && !style.bg)) continue;
    const min = Math.max(1, Number(col.attrs.min) || 1), max = Math.min(MAX_XLSX_COLS, Number(col.attrs.max) || min);
    for (let c = min; c <= max; c++) out[c - 1] = { fg: style.fg, bg: style.bg };
  }
  return Object.keys(out).length ? out : undefined;
}

/** Valores simples (texto) de cada linha: útil para importação em Planilha → Etiquetas. */
export const sheetToTable = (sheet: XlsxSheet): string[][] => sheet.rows.map((row) => row.map((c) => c?.value ?? ''));

export type XlsxFormat = 'general' | 'number' | 'integer' | 'currency' | 'percent' | 'text';
export interface XlsxOutCell { value: string | number | boolean | null; formula?: string; format?: XlsxFormat; bold?: boolean; fg?: string; bg?: string }
export interface XlsxOutSheet { name: string; rows: (XlsxOutCell | null)[][]; widths?: number[]; /** estilo de coluna inteira, por índice (base 0) */ colStyles?: (XlsxStyle | undefined)[] }

const NUM_FMT: Record<XlsxFormat, number> = { general: 0, number: 165, integer: 1, currency: 164, percent: 10, text: 49 };
const validColor = (c: string | undefined): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

/** Registro de estilos usados: cada combinação (formato, negrito, cor, preenchimento) vira um <xf>. */
class StyleBook {
  private readonly fonts: string[] = ['<font><sz val="11"/><name val="Calibri"/></font>'];
  private readonly fills: string[] = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  private readonly xfs: string[] = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  private readonly seen = new Map<string, number>();
  index(style: XlsxStyle | undefined): number {
    if (!style) return 0;
    const fg = validColor(style.fg) ? style.fg.toLowerCase() : undefined;
    const bg = validColor(style.bg) ? style.bg.toLowerCase() : undefined;
    const format = style.format ?? 'general';
    if (!style.bold && !fg && !bg && format === 'general') return 0;
    const id = [format, style.bold ? 1 : 0, fg ?? '', bg ?? ''].join('|');
    const hit = this.seen.get(id);
    if (hit !== undefined) return hit;
    let fontId = 0;
    if (style.bold || fg) {
      this.fonts.push('<font>' + (style.bold ? '<b/>' : '') + '<sz val="11"/>' + (fg ? '<color rgb="FF' + fg.slice(1).toUpperCase() + '"/>' : '') + '<name val="Calibri"/></font>');
      fontId = this.fonts.length - 1;
    }
    let fillId = 0;
    if (bg) {
      this.fills.push('<fill><patternFill patternType="solid"><fgColor rgb="FF' + bg.slice(1).toUpperCase() + '"/><bgColor indexed="64"/></patternFill></fill>');
      fillId = this.fills.length - 1;
    }
    const num = NUM_FMT[format];
    this.xfs.push(`<xf numFmtId="${num}" fontId="${fontId}" fillId="${fillId}" borderId="0" xfId="0"${num ? ' applyNumberFormat="1"' : ''}${fontId ? ' applyFont="1"' : ''}${fillId ? ' applyFill="1"' : ''}/>`);
    const at = this.xfs.length - 1;
    this.seen.set(id, at);
    return at;
  }
  xml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/><numFmt numFmtId="165" formatCode="#,##0.00"/></numFmts>
<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts>
<fills count="${this.fills.length}">${this.fills.join('')}</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  }
}

const safeSheetName = (name: string, used: Set<string>): string => {
  let base = name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Planilha';
  let candidate = base, n = 2;
  while (used.has(candidate.toLowerCase())) { const suffix = ' ' + n++; candidate = base.slice(0, 31 - suffix.length) + suffix; }
  used.add(candidate.toLowerCase());
  return candidate;
};

export async function writeXlsx(sheets: readonly XlsxOutSheet[]): Promise<Uint8Array> {
  const used = new Set<string>();
  const names = sheets.map((s) => safeSheetName(s.name, used));
  const files: { name: string; data: Uint8Array }[] = [];
  files.push({ name: '[Content_Types].xml', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`) });
  files.push({ name: '_rels/.rels', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) });
  files.push({ name: 'xl/workbook.xml', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${escapeXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr fullCalcOnLoad="1"/></workbook>`) });
  files.push({ name: 'xl/_rels/workbook.xml.rels', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) });
  const book = new StyleBook();
  const sheetFiles: { name: string; data: Uint8Array }[] = [];
  sheets.forEach((sheet, i) => {
    const colCount = Math.max(sheet.widths?.length ?? 0, sheet.colStyles?.length ?? 0);
    const colXml: string[] = [];
    for (let c = 0; c < colCount; c++) {
      const w = sheet.widths?.[c];
      const st = book.index(sheet.colStyles?.[c]);
      if (w === undefined && !st) continue;
      colXml.push(`<col min="${c + 1}" max="${c + 1}" width="${w === undefined ? 13 : Math.max(4, Math.min(80, w))}"${w === undefined ? '' : ' customWidth="1"'}${st ? ` style="${st}"` : ''}/>`);
    }
    const cols = colXml.length ? '<cols>' + colXml.join('') + '</cols>' : '';
    const rows = sheet.rows.map((row, r) => {
      const cells = row.map((cell, c) => {
        if (!cell) return '';
        const ref = colName(c) + (r + 1);
        const style = book.index({ format: cell.format, bold: cell.bold, fg: cell.fg, bg: cell.bg });
        const s = style ? ` s="${style}"` : '';
        if (cell.value === null && !cell.formula) return style ? `<c r="${ref}"${s}/>` : '';
        const f = cell.formula ? `<f>${escapeXml(cell.formula)}</f>` : '';
        if (typeof cell.value === 'number' && Number.isFinite(cell.value)) return `<c r="${ref}"${s}>${f}<v>${cell.value}</v></c>`;
        if (typeof cell.value === 'boolean') return `<c r="${ref}"${s} t="b">${f}<v>${cell.value ? 1 : 0}</v></c>`;
        const text = cell.value === null ? '' : String(cell.value);
        if (f) return `<c r="${ref}"${s} t="str">${f}<v>${escapeXml(text)}</v></c>`;
        return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
      }).join('');
      return cells ? `<row r="${r + 1}">${cells}</row>` : '';
    }).join('');
    sheetFiles.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${rows}</sheetData></worksheet>`) });
  });
  files.push({ name: 'xl/styles.xml', data: utf8(book.xml()) }, ...sheetFiles);
  return writeZip(files);
}

/** Lê CSV ou XLSX escolhido pelo usuário e devolve abas com tabelas de texto. */
export async function readTableFile(file: Blob & { name?: string }): Promise<{ name: string; rows: string[][] }[]> {
  const name = (file.name ?? '').toLowerCase();
  if (file.size > 30 * 1024 * 1024) throw new Error('Arquivo acima de 30 MB.');
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (name.endsWith('.xlsx') || (head[0] === 0x50 && head[1] === 0x4b)) {
    const sheets = await readXlsx(new Uint8Array(await file.arrayBuffer()));
    return sheets.map((s) => ({ name: s.name, rows: sheetToTable(s) }));
  }
  if (name.endsWith('.xls') || (head[0] === 0xd0 && head[1] === 0xcf)) throw new Error('Arquivos .xls antigos não são suportados. Salve como .xlsx ou .csv.');
  const { parseCsv } = await import('./csv');
  return [{ name: 'CSV', rows: parseCsv(await file.text()) }];
}
