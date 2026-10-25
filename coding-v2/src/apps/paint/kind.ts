import { cleanLabel, type DocKind } from '../../editors/docs';
import type { DocTemplate } from '../../editors/templates';
import { blankPaint, normalizePaint, type PaintState } from './model';

export const paintKind: DocKind<PaintState> = {
  type: 'paint', prefix: 'v2-paint-', appName: 'Pintar',
  normalize: normalizePaint, label: (s) => cleanLabel(s.name, 'Desenho')
};
export const paintTemplates: DocTemplate<PaintState>[] = [
  { id: 'branco', name: 'Tela branca 1280 × 720', description: 'Fundo branco, uma camada', create: () => blankPaint(1280, 720, '#ffffff', 'Desenho') },
  { id: 'quadrado', name: 'Quadrado 1080 × 1080', description: 'Ideal para posts', create: () => blankPaint(1080, 1080, '#ffffff', 'Desenho quadrado') },
  { id: 'transparente', name: 'Fundo transparente 1024 × 1024', description: 'Para ícones e adesivos (exporte em PNG)', create: () => blankPaint(1024, 1024, 'transparent', 'Desenho transparente') },
  { id: 'a4', name: 'Folha A4 (150 dpi)', description: '1240 × 1754, fundo branco', create: () => blankPaint(1240, 1754, '#ffffff', 'Desenho A4') }
];
