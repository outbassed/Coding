import { readZip, writeZip, utf8, fromUtf8, ZipError } from './zip';
import { allText, child, childrenOf, escapeXml, parseXml, type XNode } from './xml';

/** Uma célula lida: valor exibível e fórmula original (sem o "="), quando houver. */
export interface XlsxCell { value: string; formula?: string; number?: number }
export interface XlsxSheet { name: string; rows: XlsxCell[][] }
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
  const sheetsNode = child(child(wb, 'workbook'), 'sheets');
  const out: XlsxSheet[] = [];
  for (const s of childrenOf(sheetsNode, 'sheet')) {
    let target = rels.get(s.attrs.id ?? '') ?? '';
    target = target.replace(/^\/?xl\//, '').replace(/^\//, '');
    const path = 'xl/' + target;
    const data = files.get(path);
    if (!data) continue;
    out.push({ name: s.attrs.name ?? 'Planilha', rows: readSheet(parseXml(fromUtf8(data)), shared) });
  }
  if (!out.length) throw new ZipError('Nenhuma aba encontrada na planilha.');
  return out;
}

function readSheet(doc: XNode, shared: string[]): XlsxCell[][] {
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
      while (row.length < colAt) row.push({ value: '' });
      row[colAt] = cell;
    }
    while (rows.length < rowIndex) rows.push([]);
    rows[rowIndex] = row;
  }
  return rows;
}

/** Valores simples (texto) de cada linha: útil para importação em Planilha → Etiquetas. */
export const sheetToTable = (sheet: XlsxSheet): string[][] => sheet.rows.map((row) => row.map((c) => c?.value ?? ''));

export type XlsxFormat = 'general' | 'number' | 'integer' | 'currency' | 'percent' | 'text';
export interface XlsxOutCell { value: string | number | boolean | null; formula?: string; format?: XlsxFormat; bold?: boolean }
export interface XlsxOutSheet { name: string; rows: (XlsxOutCell | null)[][]; widths?: number[] }

const FORMAT_STYLE: Record<XlsxFormat, number> = { general: 0, number: 1, integer: 2, currency: 3, percent: 4, text: 5 };
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/><numFmt numFmtId="165" formatCode="#,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="12">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="165" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="1" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="10" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

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
  files.push({ name: 'xl/styles.xml', data: utf8(STYLES) });
  sheets.forEach((sheet, i) => {
    const cols = sheet.widths?.length ? '<cols>' + sheet.widths.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${Math.max(4, Math.min(80, w))}" customWidth="1"/>`).join('') + '</cols>' : '';
    const rows = sheet.rows.map((row, r) => {
      const cells = row.map((cell, c) => {
        if (!cell || (cell.value === null && !cell.formula)) return '';
        const ref = colName(c) + (r + 1);
        const style = FORMAT_STYLE[cell.format ?? 'general'] + (cell.bold ? 6 : 0);
        const s = style ? ` s="${style}"` : '';
        const f = cell.formula ? `<f>${escapeXml(cell.formula)}</f>` : '';
        if (typeof cell.value === 'number' && Number.isFinite(cell.value)) return `<c r="${ref}"${s}>${f}<v>${cell.value}</v></c>`;
        if (typeof cell.value === 'boolean') return `<c r="${ref}"${s} t="b">${f}<v>${cell.value ? 1 : 0}</v></c>`;
        const text = cell.value === null ? '' : String(cell.value);
        if (f) return `<c r="${ref}"${s} t="str">${f}<v>${escapeXml(text)}</v></c>`;
        return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
      }).join('');
      return cells ? `<row r="${r + 1}">${cells}</row>` : '';
    }).join('');
    files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${rows}</sheetData></worksheet>`) });
  });
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
