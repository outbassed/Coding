import type { DocKind } from '../../editors/docs';
import { cleanLabel } from '../../editors/docs';
import type { DocTemplate } from '../../editors/templates';
import { blankSplit, demoSplit, normalizeSplit, sid, type SplitState } from './model';

export const splitKind: DocKind<SplitState> = {
  type: 'split', prefix: 'v2-split-', appName: 'Racha-conta',
  normalize: normalizeSplit, label: (s) => cleanLabel(s.name, 'Racha-conta')
};
export const splitTemplates: DocTemplate<SplitState>[] = [
  { id: 'viagem', name: 'Viagem com amigos', description: '4 pessoas, divisões igual, por % e por valor', create: demoSplit },
  { id: 'jantar', name: 'Jantar', description: 'Conta de restaurante com gorjeta', create: () => {
    const a = sid(), b = sid(), c = sid();
    return { name: 'Jantar de sexta', currency: 'BRL', people: [{ id: a, name: 'Lia' }, { id: b, name: 'Rui' }, { id: c, name: 'Téo' }],
      expenses: [
        { id: sid(), description: 'Pratos e bebidas', amount: 28740, payer: a, mode: 'equal', shares: {}, participants: [a, b, c] },
        { id: sid(), description: 'Gorjeta (10%)', amount: 2874, payer: b, mode: 'equal', shares: {}, participants: [a, b, c] }
      ] };
  } },
  { id: 'em-branco', name: 'Em branco', description: 'Duas pessoas e nenhuma despesa', create: blankSplit }
];
