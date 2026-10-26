import { writeZip, utf8 } from '../shared/files/zip';
import { escapeXml } from '../shared/files/xml';

/** Modelo intermediário do documento (independente do DOM) usado para gerar o DOCX. */
export interface DRun { text: string; b?: boolean; i?: boolean; u?: boolean; s?: boolean; font?: string; sizePx?: number; color?: string; bg?: string; br?: boolean; href?: string }
export interface DImage { data: Uint8Array; ext: 'png' | 'jpeg'; widthPx: number; heightPx: number; percent: number }
export type DInline = DRun | { image: DImage };
export interface DPara { kind: 'p'; style: 'Normal' | 'Heading1' | 'Heading2' | 'Heading3' | 'Quote'; align?: 'left' | 'center' | 'right' | 'justify'; runs: DInline[]; list?: { type: 'ul' | 'ol'; id: number }; pageBreakBefore?: boolean; lineHeight?: number }
export interface DTable { kind: 'table'; rows: { header: boolean; cells: DPara[][] }[] }
export type DBlock = DPara | DTable;

const EMU_PER_MM = 36000;
const CONTENT_MM = 170;
const hex = (c?: string) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c.slice(1).toUpperCase() : null);
function runXml(r: DRun): string {
  const props: string[] = [];
  if (r.font) props.push(`<w:rFonts w:ascii="${escapeXml(r.font)}" w:hAnsi="${escapeXml(r.font)}" w:cs="${escapeXml(r.font)}"/>`);
  if (r.b) props.push('<w:b/>');
  if (r.i) props.push('<w:i/>');
  if (r.s) props.push('<w:strike/>');
  const color = hex(r.color); if (color) props.push(`<w:color w:val="${color}"/>`);
  if (r.sizePx) props.push(`<w:sz w:val="${Math.round(r.sizePx * 0.75 * 2)}"/>`);
  if (r.u) props.push('<w:u w:val="single"/>');
  const bg = hex(r.bg); if (bg) props.push(`<w:shd w:val="clear" w:color="auto" w:fill="${bg}"/>`);
  const rPr = props.length ? '<w:rPr>' + props.join('') + '</w:rPr>' : '';
  if (r.br) return '<w:r>' + rPr + '<w:br/></w:r>';
  return '<w:r>' + rPr + '<w:t xml:space="preserve">' + escapeXml(r.text) + '</w:t></w:r>';
}
interface Ctx { images: { name: string; data: Uint8Array; rid: string }[]; links: { rid: string; href: string }[]; nextDraw: number }
function imageXml(img: DImage, ctx: Ctx): string {
  const n = ctx.images.length + 1;
  const rid = 'rIdImg' + n;
  const name = 'image' + n + '.' + (img.ext === 'jpeg' ? 'jpeg' : 'png');
  ctx.images.push({ name, data: img.data, rid });
  const cx = Math.round(CONTENT_MM * EMU_PER_MM * Math.max(0.05, Math.min(1, img.percent / 100)));
  const cy = Math.round(cx * (img.heightPx / Math.max(1, img.widthPx)));
  const id = ctx.nextDraw++;
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Imagem ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}
function paraXml(p: DPara, ctx: Ctx, numIds: Map<number, number>): string {
  const props: string[] = [];
  if (p.style !== 'Normal') props.push(`<w:pStyle w:val="${p.style}"/>`);
  if (p.pageBreakBefore) props.push('<w:pageBreakBefore/>');
  if (p.list) props.push(`<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numIds.get(p.list.id) ?? 1}"/></w:numPr>`);
  if (p.lineHeight) props.push(`<w:spacing w:line="${Math.round(p.lineHeight * 240)}" w:lineRule="auto"/>`);
  if (p.align) props.push(`<w:jc w:val="${p.align === 'justify' ? 'both' : p.align}"/>`);
  const pPr = props.length ? '<w:pPr>' + props.join('') + '</w:pPr>' : '';
  const runs = p.runs.map((r) => {
    if ('image' in r) return imageXml(r.image, ctx);
    if (!r.href || r.br) return runXml(r);
    // link de verdade: relação externa + estilo azul sublinhado (sem depender do estilo "Hyperlink")
    let link = ctx.links.find((l) => l.href === r.href);
    if (!link) { link = { rid: 'rIdLink' + (ctx.links.length + 1), href: r.href }; ctx.links.push(link); }
    return `<w:hyperlink r:id="${link.rid}" w:history="1">${runXml({ ...r, color: r.color ?? '#1155CC', u: true })}</w:hyperlink>`;
  }).join('');
  return '<w:p>' + pPr + runs + '</w:p>';
}
function tableXml(t: DTable, ctx: Ctx, numIds: Map<number, number>): string {
  const cols = Math.max(1, ...t.rows.map((r) => r.cells.length));
  const w = Math.floor((CONTENT_MM * 56.7) / cols); // twips (1 mm ≈ 56,7 twips)
  const border = '<w:top w:val="single" w:sz="4" w:color="999999"/><w:left w:val="single" w:sz="4" w:color="999999"/><w:bottom w:val="single" w:sz="4" w:color="999999"/><w:right w:val="single" w:sz="4" w:color="999999"/><w:insideH w:val="single" w:sz="4" w:color="999999"/><w:insideV w:val="single" w:sz="4" w:color="999999"/>';
  const grid = '<w:tblGrid>' + Array.from({ length: cols }, () => `<w:gridCol w:w="${w}"/>`).join('') + '</w:tblGrid>';
  const rows = t.rows.map((r) => '<w:tr>' + (r.header ? '<w:trPr><w:tblHeader/></w:trPr>' : '') + Array.from({ length: cols }, (_, c) => {
    const paras = r.cells[c] ?? [];
    const content = paras.length ? paras.map((p) => paraXml(r.header ? { ...p, runs: p.runs.map((x) => ('image' in x ? x : { ...x, b: true })) } : p, ctx, numIds)).join('') : '<w:p/>';
    return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${r.header ? '<w:shd w:val="clear" w:color="auto" w:fill="EEF1F6"/>' : ''}</w:tcPr>${content}</w:tc>`;
  }).join('') + '</w:tr>').join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${border}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr>${grid}${rows}</w:tbl><w:p/>`;
}
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/><w:sz w:val="24"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="42"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="33"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="27"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="567"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="8DA5D9"/></w:pBdr></w:pPr><w:rPr><w:color w:val="36475C"/></w:rPr></w:style>
</w:styles>`;
export async function buildDocx(blocks: readonly DBlock[], title: string): Promise<Uint8Array> {
  const ctx: Ctx = { images: [], links: [], nextDraw: 1 };
  // uma numeração por lista: listas numeradas diferentes recomeçam do 1
  const listIds = new Map<number, 'ul' | 'ol'>();
  const visit = (p: DPara) => { if (p.list) listIds.set(p.list.id, p.list.type); };
  for (const b of blocks) { if (b.kind === 'p') visit(b); else for (const r of b.rows) for (const c of r.cells) c.forEach(visit); }
  const numIds = new Map<number, number>();
  let numXml = '';
  let n = 1;
  for (const [id, type] of listIds) { numIds.set(id, n); numXml += `<w:num w:numId="${n}"><w:abstractNumId w:val="${type === 'ul' ? 0 : 1}"/>${type === 'ol' ? '<w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride>' : ''}</w:num>`; n++; }
  const body = blocks.map((b) => (b.kind === 'p' ? paraXml(b, ctx, numIds) : tableXml(b, ctx, numIds))).join('');
  const sect = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>';
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body || '<w:p/>'}${sect}</w:body></w:document>`;
  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
${numXml || '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>'}</w:numbering>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${ctx.images.map((i) => `<Relationship Id="${i.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${i.name}"/>`).join('')}${ctx.links.map((l) => `<Relationship Id="${l.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(l.href)}" TargetMode="External"/>`).join('')}</Relationships>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const root = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(title)}</dc:title><dc:creator>Coding</dc:creator><dc:language>pt-BR</dc:language></cp:coreProperties>`;
  return writeZip([
    { name: '[Content_Types].xml', data: utf8(types) },
    { name: '_rels/.rels', data: utf8(root) },
    { name: 'docProps/core.xml', data: utf8(core) },
    { name: 'word/document.xml', data: utf8(document) },
    { name: 'word/styles.xml', data: utf8(STYLES) },
    { name: 'word/numbering.xml', data: utf8(numbering) },
    { name: 'word/_rels/document.xml.rels', data: utf8(rels) },
    ...ctx.images.map((i) => ({ name: 'word/media/' + i.name, data: i.data }))
  ]);
}
