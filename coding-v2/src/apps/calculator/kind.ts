import { cleanLabel, type DocKind } from '../../editors/docs';
import type { DocTemplate } from '../../editors/templates';
import { emptyCalc, normalizeCalc, type CalcState } from './model';

export const calculatorKind: DocKind<CalcState> = {
  type: 'calculator', prefix: 'v2-calculator-', appName: 'Calculadora',
  normalize: normalizeCalc, label: (s) => cleanLabel(s.name, 'Calculadora')
};
export const calculatorTemplates: DocTemplate<CalcState>[] = [
  { id: 'basica', name: 'Básica', description: 'Quatro operações, porcentagem e memória', create: () => emptyCalc('basic') },
  { id: 'cientifica', name: 'Científica (Pro)', description: 'Funções, parênteses, constantes e variáveis', create: () => emptyCalc('pro') },
  { id: 'juros', name: 'Juros compostos', description: 'Capital, taxa e meses já como variáveis', create: () => normalizeCalc({
    name: 'Juros compostos', mode: 'pro', decimals: 2, expr: 'capital*(1+taxa)^meses',
    vars: [{ name: 'capital', value: 1000 }, { name: 'taxa', value: 0.01 }, { name: 'meses', value: 12 }]
  }) },
  { id: 'desconto', name: 'Desconto e acréscimo', description: 'Porcentagem sobre um valor: 200 − 15%', create: () => normalizeCalc({ name: 'Desconto e acréscimo', mode: 'basic', decimals: 2, expr: '200−15%' }) }
];
