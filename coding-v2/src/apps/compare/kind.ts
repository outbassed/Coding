import { cleanLabel, type DocKind } from '../../editors/docs';
import type { DocTemplate } from '../../editors/templates';
import { emptyCompare, normalizeCompare, textSource, type CompareState } from './model';

export const compareKind: DocKind<CompareState> = {
  type: 'compare', prefix: 'v2-compare-', appName: 'Comparador de Arquivos',
  normalize: normalizeCompare, label: (s) => cleanLabel(s.name, 'Comparação de arquivos')
};
export const compareTemplates: DocTemplate<CompareState>[] = [
  { id: 'vazio', name: 'Comparação em branco', description: 'Escolha dois arquivos ou cole os textos', create: () => emptyCompare() },
  {
    id: 'versoes', name: 'Duas versões de um texto', description: 'Exemplo pronto para ver as diferenças',
    create: () => ({
      ...emptyCompare('Duas versões de um texto'),
      a: textSource('versão-1.txt', 'Prezados clientes,\nA loja abre às 9h e fecha às 18h.\nAceitamos cartão e dinheiro.\nObrigado pela preferência.\n'),
      b: textSource('versão-2.txt', 'Prezados clientes,\nA loja abre às 8h e fecha às 18h.\nAceitamos cartão, Pix e dinheiro.\nObrigado pela preferência.\nVolte sempre!\n')
    })
  },
  {
    id: 'listas', name: 'Listas (ignorando maiúsculas)', description: 'Compara listas sem se importar com caixa e espaços',
    create: () => ({
      ...emptyCompare('Comparação de listas'),
      a: textSource('lista-a.txt', 'Maçã\nBanana\nUva\nPera\n'),
      b: textSource('lista-b.txt', 'maçã\n banana\nUva\nLaranja\n'),
      options: { ignoreCase: true, ignoreSpace: true, ignoreBlank: true }
    })
  }
];
