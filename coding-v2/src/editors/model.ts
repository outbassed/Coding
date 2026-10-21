export type EditorToolId = 'labels' | 'texts';

export interface EditorCommand { id: string; label: string }
export interface EditorGroup { label: string; commands: EditorCommand[] }
export interface EditorTab { id: string; label: string; blurb: string; groups: EditorGroup[] }

export const isEditorToolId = (value: unknown): value is EditorToolId => value === 'labels' || value === 'texts';

const cmd = (id: string, label: string): EditorCommand => ({ id, label });

/** Estrutura PREVISTA dos comandos. Nada aqui executa ação: os motores ainda não foram integrados. */
export const editorTabs: Record<EditorToolId, EditorTab[]> = {
  labels: [
    { id: 'sheet', label: 'Folha', blurb: 'Escolha o modelo de folha A4 e a grade de etiquetas.', groups: [
      { label: 'Modelo', commands: [cmd('model', 'Modelo de folha'), cmd('grid', 'Colunas e linhas')] },
      { label: 'Margens', commands: [cmd('margins', 'Margens'), cmd('gap', 'Espaçamento')] }
    ] },
    { id: 'content', label: 'Conteúdo', blurb: 'Defina o código e a descrição de cada etiqueta.', groups: [
      { label: 'Etiqueta', commands: [cmd('code', 'Código'), cmd('desc', 'Descrição'), cmd('qty', 'Quantidade')] },
      { label: 'Dados', commands: [cmd('import', 'Importar lista')] }
    ] },
    { id: 'codes', label: 'Códigos', blurb: 'Adicione QR code ou código de barras às etiquetas.', groups: [
      { label: 'Tipo', commands: [cmd('qr', 'QR code'), cmd('bar', 'Código de barras')] }
    ] },
    { id: 'export', label: 'Saída', blurb: 'Imprima ou gere um PDF da folha.', groups: [
      { label: 'Saída', commands: [cmd('print', 'Imprimir'), cmd('pdf', 'Gerar PDF')] }
    ] }
  ],
  texts: [
    { id: 'home', label: 'Início', blurb: 'Fonte, parágrafo e estilos do texto selecionado.', groups: [
      { label: 'Fonte', commands: [cmd('font', 'Fonte'), cmd('size', 'Tamanho'), cmd('bold', 'Negrito'), cmd('italic', 'Itálico')] },
      { label: 'Parágrafo', commands: [cmd('align', 'Alinhamento'), cmd('list', 'Listas'), cmd('space', 'Espaçamento')] }
    ] },
    { id: 'insert', label: 'Inserir', blurb: 'Imagens, tabelas e quebras de página.', groups: [
      { label: 'Objetos', commands: [cmd('image', 'Imagem'), cmd('table', 'Tabela'), cmd('break', 'Quebra de página')] }
    ] },
    { id: 'layout', label: 'Página', blurb: 'Tamanho, orientação e margens da página.', groups: [
      { label: 'Página', commands: [cmd('size', 'Tamanho'), cmd('orient', 'Orientação'), cmd('margins', 'Margens')] }
    ] },
    { id: 'export', label: 'Saída', blurb: 'Imprima ou exporte o documento.', groups: [
      { label: 'Saída', commands: [cmd('print', 'Imprimir'), cmd('pdf', 'Exportar PDF')] }
    ] }
  ]
};

export const ZOOM_STEPS: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5, 2];
