import { initialTextState, type TextState } from './model';

export interface TextTemplate { id: string; name: string; create(): TextState }
const today = (): string => new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
export const TEXT_TEMPLATES: TextTemplate[] = [
  { id: 'carta', name: 'Carta', create: initialTextState },
  { id: 'relatorio', name: 'Relatório', create: () => ({ name: 'Relatório mensal', html:
    '<h1>Relatório mensal</h1><p style="color: #596579">' + today() + ' · Equipe de operações</p>'
    + '<h2>1. Resumo</h2><p>Escreva aqui os principais resultados do período. Use <strong>negrito</strong> para destacar números importantes.</p>'
    + '<h2>2. Indicadores</h2><table><tbody><tr><th>Indicador</th><th>Meta</th><th>Resultado</th></tr><tr><td>Pedidos entregues</td><td>1.200</td><td>1.284</td></tr><tr><td>Prazo médio (dias)</td><td>3</td><td>2,6</td></tr><tr><td>Satisfação</td><td>90%</td><td>93%</td></tr></tbody></table>'
    + '<h2>3. Próximos passos</h2><ul><li>Revisar o estoque de embalagens</li><li>Treinar a nova equipe</li><li>Apresentar o plano do próximo mês</li></ul>'
    + '<hr data-break="page"><h2>Anexo</h2><p>Este conteúdo começa em uma nova página.</p>' }) },
  { id: 'ata', name: 'Ata de reunião', create: () => ({ name: 'Ata de reunião', html:
    '<h1>Ata de reunião</h1><p><strong>Data:</strong> ' + today() + '<br><strong>Participantes:</strong> Ana, Bruno, Carla</p>'
    + '<h2>Pauta</h2><ol><li>Abertura</li><li>Resultados da semana</li><li>Encaminhamentos</li></ol>'
    + '<h2>Decisões</h2><table><tbody><tr><th>Assunto</th><th>Responsável</th><th>Prazo</th></tr><tr><td>Novo fornecedor</td><td>Ana</td><td>sexta-feira</td></tr><tr><td>Ajuste da escala</td><td>Bruno</td><td>próxima semana</td></tr></tbody></table>' }) },
  { id: 'em-branco', name: 'Documento em branco', create: () => ({ name: 'Documento sem título', html: '<p><br></p>' }) }
];
export const textTemplate = (id: string | null): TextState | null => TEXT_TEMPLATES.find((t) => t.id === id)?.create() ?? null;
