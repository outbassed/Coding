import { cleanLabel, type DocKind } from '../../editors/docs';
import type { DocTemplate } from '../../editors/templates';
import {
  STYLE_PRESETS, applyStyle, blankScene, blankText, blankVersos, normalizeVersos, presetStyle,
  type Scene, type TextBlock, type VersosState
} from './model';

/** O tipo gravado é o mesmo usado pela Biblioteca e pelo pacote de backup: 'versos'. */
export const versosKind: DocKind<VersosState> = { type: 'versos', prefix: 'v2-versos-', appName: 'Versos', normalize: normalizeVersos, label: (s) => cleanLabel(s.name, 'Projeto Versos') };

function text(scene: Scene, content: string, presetId: string, over: Partial<TextBlock> = {}): TextBlock {
  const t = blankText(scene, content);
  applyStyle(t, presetStyle(STYLE_PRESETS.find((p) => p.id === presetId)!, scene.height));
  Object.assign(t, over);
  return t;
}

/** Letra de exemplo ORIGINAL (escrita para este modelo): serve só para mostrar como ficam as cenas. */
function lyrics(): VersosState {
  const verses = [
    'Quando a tarde desce devagar\ne a cidade acende os seus telhados',
    'eu guardo o seu nome na janela\ncomo quem protege um fio de luz',
    'O que é de verdade não tem pressa:\nvolta com a chuva, volta com o vento',
    'e se a noite insistir em ser comprida\nacendo um verso pro amanhecer'
  ];
  const colors = ['#101820', '#14213d', '#1b1f3b', '#0f2a2e'];
  const state = blankVersos('Letra de exemplo', 1920, 1080);
  const title = blankScene(1920, 1080);
  title.name = 'Título';
  title.background.color = '#0b0f14';
  title.texts.push(
    text(title, 'Título da música', 'classico', { y: 470, size: 120 }),
    text(title, 'ARTISTA', 'cinema', { y: 640, size: 40, color: '#cfd6e4', opacity: 0.85 })
  );
  state.scenes = [title];
  verses.forEach((v, i) => {
    const s = blankScene(1920, 1080);
    s.name = 'Verso ' + (i + 1);
    s.background.color = colors[i % colors.length]!;
    s.texts.push(text(s, v, 'poetico', { size: 78, width: 1500 }));
    state.scenes.push(s);
  });
  return state;
}
function quote(): VersosState {
  const state = blankVersos('Citação', 1080, 1350);
  const s = state.scenes[0]!;
  s.name = 'Citação';
  s.background.color = '#f2ece1';
  s.texts.push(
    text(s, 'A beleza está nos\ndetalhes que a pressa\nnão enxerga.', 'classico', { color: '#2b2118', size: 84, y: 600, width: 880, shadow: { color: '#000000', opacity: 0, blur: 0, x: 0, y: 0 } }),
    text(s, 'SEU NOME', 'moderno', { color: '#8a6d3b', size: 30, y: 1050, letterSpacing: 6, weight: 600 })
  );
  return state;
}
function story(): VersosState {
  const state = blankVersos('Story', 1080, 1920);
  const s = state.scenes[0]!;
  s.name = 'Story';
  s.background.color = '#ff3d57';
  s.texts.push(
    text(s, 'GRANDE\nANÚNCIO', 'impacto', { size: 260, y: 820, width: 960, lineHeight: 0.95, stroke: { color: '#14161c', width: 10 } }),
    text(s, 'toque para saber mais', 'moderno', { size: 46, y: 1380, weight: 500, letterSpacing: 2 })
  );
  return state;
}
function transparentTitle(): VersosState {
  const state = blankVersos('Texto sobre transparência', 1920, 1080);
  const s = state.scenes[0]!;
  s.name = 'Título';
  s.background = { mode: 'transparent', color: '#14161c', alpha: 1, image: null };
  s.texts.push(
    text(s, 'Título do vídeo', 'moderno', { size: 130, y: 500, shadow: { color: '#000000', opacity: 0.7, blur: 18, x: 0, y: 6 } }),
    text(s, 'subtítulo ou nome de quem fala', 'moderno', { size: 48, y: 640, weight: 400, shadow: { color: '#000000', opacity: 0.7, blur: 12, x: 0, y: 4 } })
  );
  return state;
}

export const versosTemplates: DocTemplate<VersosState>[] = [
  { id: 'em-branco', name: 'Em branco', description: 'Uma cena quadrada 1080 × 1080, sem textos', create: () => blankVersos('Novo projeto') },
  { id: 'letra', name: 'Letra em cenas (exemplo)', description: 'Título e quatro versos originais em 16:9, para trocar pelos seus', create: lyrics },
  { id: 'citacao', name: 'Citação 4:5', description: 'Frase e assinatura em 1080 × 1350', create: quote },
  { id: 'story', name: 'Story 9:16', description: 'Título grande com contorno em 1080 × 1920', create: story },
  { id: 'transparente', name: 'Texto sobre transparência', description: 'Fundo transparente para exportar só os textos em PNG', create: transparentTitle }
];
