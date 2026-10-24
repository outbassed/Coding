import { cleanLabel, type DocKind } from '../../editors/docs';
import type { DocTemplate } from '../../editors/templates';
import { demoDraw, normalizeDraw, type DrawState } from './model';

export const drawKind: DocKind<DrawState> = { type: 'draw', prefix: 'v2-draw-', appName: 'Sorteio', normalize: normalizeDraw, label: (s) => cleanLabel(s.name, 'Sorteio') };
export const drawTemplates: DocTemplate<DrawState>[] = [
  { id: 'equipe', name: 'Sorteio da equipe', description: '8 nomes na roleta, sem repetir', create: demoDraw },
  { id: 'bingo', name: 'Bingo', description: 'Números de 1 a 75, sem repetir', create: () => normalizeDraw({ name: 'Bingo', mode: 'numbers', numbers: { min: 1, max: 75, count: 1, unique: true } }) },
  { id: 'futebol', name: 'Times de futebol', description: '10 jogadores em 2 times', create: () => normalizeDraw({ name: 'Pelada de quinta', mode: 'teams', participants: ['Alex', 'Beto', 'Caio', 'Duda', 'Edu', 'Fê', 'Gui', 'Hel', 'Ivo', 'Juca'], teams: { count: 2 } }) },
  { id: 'em-branco', name: 'Em branco', description: 'Sem participantes', create: () => normalizeDraw({ name: 'Novo sorteio' }) }
];
