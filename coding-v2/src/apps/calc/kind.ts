import { cleanLabel, type DocKind } from '../../editors/docs';
import type { DocTemplate } from '../../editors/templates';
import { blankCalc, budgetTemplate, normalizeCalc, productsTemplate, type CalcState } from './model';

export const calcKind: DocKind<CalcState> = { type: 'calc', prefix: 'v2-calc-', appName: 'Planilhas', normalize: normalizeCalc, label: (s) => cleanLabel(s.name, 'Planilha') };
export const calcTemplates: DocTemplate<CalcState>[] = [
  { id: 'orcamento', name: 'Orçamento do mês', description: 'Previsto × realizado com totais e %', create: budgetTemplate },
  { id: 'produtos', name: 'Tabela de produtos', description: 'Quantidade × preço com total geral', create: productsTemplate },
  { id: 'em-branco', name: 'Em branco', description: 'Uma aba vazia', create: blankCalc }
];
