export type ToolId = 'labels' | 'texts' | 'calc' | 'images' | 'pdf' | 'codes' | 'sheet-labels' | 'draw' | 'split';

export interface CodingTool {
  id: ToolId;
  name: string;
  description: string;
  color: string;
  path: string | null;
  /** UI-base existente nesta branch; NÃO significa motor migrado nem PWA instalado. */
  shellReady: boolean;
  initiallyActive: boolean;
}

export const tools: readonly CodingTool[] = [
  { id: 'labels', name: 'Etiquetas', description: 'Folhas A4, códigos e descrições', color: '#F28B30', path: '/apps/etiquetas/', shellReady: true, initiallyActive: true },
  { id: 'texts', name: 'Texto', description: 'Documentos, formatação e imagens', color: '#4C8DF6', path: '/apps/texto/', shellReady: true, initiallyActive: true },
  { id: 'calc', name: 'Planilhas', description: 'Tabelas, cálculos e fórmulas', color: '#34A853', path: null, shellReady: false, initiallyActive: false },
  { id: 'images', name: 'Imagens', description: 'Edição, molduras, filtros e camadas', color: '#E8538F', path: null, shellReady: false, initiallyActive: false },
  { id: 'pdf', name: 'Editor PDF', description: 'Organização e anotações em PDF', color: '#E75358', path: null, shellReady: false, initiallyActive: false },
  { id: 'codes', name: 'QR / Barras', description: 'QR codes e códigos de barras', color: '#976DF7', path: null, shellReady: false, initiallyActive: false },
  { id: 'sheet-labels', name: 'Planilha → Etiquetas', description: 'Gerar etiquetas com dados de planilhas', color: '#14B8A6', path: null, shellReady: false, initiallyActive: false },
  { id: 'draw', name: 'Sorteio', description: 'Roleta, equipes, dados e números', color: '#F5B820', path: null, shellReady: false, initiallyActive: false },
  { id: 'split', name: 'Racha-conta', description: 'Divisão de despesas e resumos', color: '#84CC16', path: null, shellReady: false, initiallyActive: false }
] as const;

export const getTool = (id: ToolId): CodingTool => {
  const tool = tools.find((item) => item.id === id);
  if (!tool) throw new Error('Ferramenta desconhecida: ' + id);
  return tool;
};
