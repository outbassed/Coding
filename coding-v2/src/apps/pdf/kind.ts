import { cleanLabel, type DocKind } from '../../editors/docs';
import type { DocTemplate } from '../../editors/templates';
import { normalizePdf, type PdfState } from './model';

export const pdfKind: DocKind<PdfState> = { type: 'pdf', prefix: 'v2-pdf-', appName: 'Editor PDF', normalize: normalizePdf, label: (s) => cleanLabel(s.name, 'Documento PDF') };
export const pdfTemplates: DocTemplate<PdfState>[] = [
  { id: 'novo', name: 'Novo projeto de PDF', description: 'Abra um ou mais PDFs, ou use o PDF de exemplo', create: () => ({ name: 'Documento PDF', sources: [], pages: [], annotations: [] }) }
];
