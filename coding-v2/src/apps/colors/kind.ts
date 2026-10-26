import { cleanLabel, type DocKind } from '../../editors/docs';
import type { DocTemplate } from '../../editors/templates';
import { emptyColors, normalizeColors, type ColorsState } from './model';

export const colorsKind: DocKind<ColorsState> = {
  type: 'colors', prefix: 'v2-colors-', appName: 'Estúdio de Cores',
  normalize: normalizeColors, label: (s) => cleanLabel(s.name, 'Paleta de cores')
};
const palette = (name: string, base: string, entries: [string, string][]): ColorsState => normalizeColors({
  name, base, palette: entries.map(([hex, label]) => ({ hex, name: label }))
});
export const colorsTemplates: DocTemplate<ColorsState>[] = [
  { id: 'vazia', name: 'Paleta vazia', description: 'Comece escolhendo uma cor', create: () => emptyColors() },
  { id: 'marca', name: 'Identidade visual', description: 'Primária, secundária, neutras e avisos', create: () => palette('Identidade visual', '#2F5FD0', [['#2F5FD0', 'Primária'], ['#F28B30', 'Destaque'], ['#141922', 'Texto'], ['#F3F5F9', 'Fundo'], ['#17724A', 'Sucesso'], ['#B12F2F', 'Erro']]) },
  { id: 'oceano', name: 'Oceano', description: 'Azuis e verdes-água', create: () => palette('Oceano', '#0E7490', [['#0B3C5D', 'Profundo'], ['#0E7490', 'Mar'], ['#27B4CF', 'Raso'], ['#9BE3EE', 'Espuma'], ['#F2FBFD', 'Areia clara']]) },
  { id: 'outono', name: 'Outono', description: 'Laranjas, ocres e marrons', create: () => palette('Outono', '#C8571C', [['#5B2A12', 'Tronco'], ['#C8571C', 'Folha seca'], ['#F28B30', 'Abóbora'], ['#F5B820', 'Mel'], ['#FBEBD0', 'Palha']]) },
  { id: 'pastel', name: 'Pastel', description: 'Tons suaves para fundos', create: () => palette('Pastel', '#B8C7FF', [['#FFD6E0', 'Rosa'], ['#FFEFC2', 'Creme'], ['#D4F5E2', 'Menta'], ['#CFE3FF', 'Céu'], ['#E4D9FF', 'Lavanda']]) }
];
