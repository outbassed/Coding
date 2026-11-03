import { cleanLabel, type DocKind } from '../../editors/docs';
import type { DocTemplate } from '../../editors/templates';
import { emptyViewer, normalizeViewer, type ViewerState } from './model';

export const viewerKind: DocKind<ViewerState> = {
  type: 'viewer', prefix: 'v2-viewer-', appName: 'Visualizador',
  normalize: normalizeViewer, label: (s) => cleanLabel(s.name, 'Arquivos para visualizar')
};
export const viewerTemplates: DocTemplate<ViewerState>[] = [
  { id: 'vazio', name: 'Projeto vazio', description: 'Abra imagens, SVG, vídeo, áudio, modelos 3D, PDF e textos', create: () => emptyViewer() }
];
