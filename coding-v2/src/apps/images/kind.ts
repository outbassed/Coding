import { cleanLabel, type DocKind } from '../../editors/docs';
import type { DocTemplate } from '../../editors/templates';
import { blankImages, demoImages, normalizeImages, type ImagesState } from './model';

export const imagesKind: DocKind<ImagesState> = { type: 'images', prefix: 'v2-images-', appName: 'Imagens', normalize: normalizeImages, label: (s) => cleanLabel(s.name, 'Imagem') };
export const imagesTemplates: DocTemplate<ImagesState>[] = [
  { id: 'cartaz', name: 'Cartaz de exemplo', description: 'Formas e textos prontos para editar (1080 × 1350)', create: demoImages },
  { id: 'quadrado', name: 'Post quadrado', description: '1080 × 1080, fundo branco', create: () => ({ ...blankImages(1080, 1080), name: 'Post quadrado' }) },
  { id: 'story', name: 'Story / Status', description: '1080 × 1920, vertical', create: () => ({ ...blankImages(1080, 1920), name: 'Story' }) },
  { id: 'paisagem', name: 'Paisagem HD', description: '1920 × 1080, horizontal', create: () => ({ ...blankImages(1920, 1080), name: 'Imagem horizontal' }) }
];
