import { cleanLabel, type DocKind } from '../../editors/docs';
import type { DocTemplate } from '../../editors/templates';
import { emptyZip, normalizeZip, type ZipState } from './model';

export const zipKind: DocKind<ZipState> = {
  type: 'zip', prefix: 'v2-zip-', appName: 'Compactador ZIP',
  normalize: normalizeZip, label: (s) => cleanLabel(s.name, 'Arquivos compactados')
};
export const zipTemplates: DocTemplate<ZipState>[] = [
  { id: 'vazio', name: 'ZIP compactado', description: 'Junte arquivos e compacte para enviar', create: () => emptyZip() },
  { id: 'armazenar', name: 'ZIP sem compressão', description: 'Só agrupa os arquivos (rápido; bom para fotos e vídeos)', create: () => ({ ...emptyZip('Arquivos agrupados'), compress: false }) },
  { id: 'envio', name: 'Pacote para enviar', description: 'Compactado, com nome pronto para anexar em e-mail', create: () => emptyZip('Pacote para envio') }
];
