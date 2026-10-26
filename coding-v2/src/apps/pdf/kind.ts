import { cleanLabel, type DocKind } from '../../editors/docs';
import type { DocTemplate } from '../../editors/templates';
import { blankSize, normalizePdf, pid, type PdfState } from './model';

export const pdfKind: DocKind<PdfState> = { type: 'pdf', prefix: 'v2-pdf-', appName: 'Editor PDF', normalize: normalizePdf, label: (s) => cleanLabel(s.name, 'Documento PDF') };
const blankDoc = (name: string, format: 'a4' | 'a3' | 'letter', orientation: 'portrait' | 'landscape', pages: number): PdfState =>
  ({ name, sources: [], pages: Array.from({ length: pages }, () => ({ id: pid(), src: '', index: 0, rotate: 0 as const, blank: blankSize(format, orientation) })), annotations: [] });
export const pdfTemplates: DocTemplate<PdfState>[] = [
  { id: 'novo', name: 'Novo projeto de PDF', description: 'Abra um ou mais PDFs, ou use o PDF de exemplo', create: () => ({ name: 'Documento PDF', sources: [], pages: [], annotations: [] }) },
  { id: 'branco-a4', name: 'Página A4 em branco', description: 'Uma folha A4 em retrato para escrever e anotar', create: () => blankDoc('Documento em branco', 'a4', 'portrait', 1) },
  { id: 'branco-a4-paisagem', name: 'Página A4 em branco (paisagem)', description: 'Uma folha A4 deitada', create: () => blankDoc('Documento em branco (paisagem)', 'a4', 'landscape', 1) }
];
