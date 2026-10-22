export type ToolId = 'labels' | 'texts' | 'calc' | 'images' | 'pdf' | 'codes' | 'sheet-labels' | 'draw' | 'split';

/**
 * preview: existe uma casca visual nesta branch (NÃO significa motor migrado nem PWA instalado).
 * planned: ainda só existe na versão estável.
 */
export type ToolStatus = 'preview' | 'planned';

export type CategoryId = 'writing' | 'labels' | 'data' | 'media' | 'fun';
export const categories: readonly { id: CategoryId; label: string }[] = [
  { id: 'writing', label: 'Escrita' },
  { id: 'labels', label: 'Etiquetas e códigos' },
  { id: 'data', label: 'Planilhas e contas' },
  { id: 'media', label: 'Imagens e PDF' },
  { id: 'fun', label: 'Utilidades' }
];

export interface CodingTool {
  id: ToolId;
  category: CategoryId;
  /** Só o que já funciona de verdade nesta versão; vazio = ainda sem editor completo. */
  ready: readonly string[];
  name: string;
  description: string;
  /** Preenchimento da marca (ícones e botões; texto sobre ele usa a tinta escura global). */
  color: string;
  /** Variante para TEXTO no tema claro (contraste mínimo 4,5:1 sobre as superfícies claras). */
  textLight: string;
  /** Variante para TEXTO no tema escuro. */
  textDark: string;
  path: string | null;
  /** Rota equivalente na versão estável (hash). */
  legacyHash: string;
  status: ToolStatus;
  initiallyActive: boolean;
  /** O que o app deverá oferecer; é planejamento, não funcionalidade entregue. */
  planned: readonly string[];
}

export const INK = '#141922';

const READY_labels = ['Editor de código e descrição por item', 'Folha A4 ao vivo, retrato ou paisagem', 'Colunas, espaçamento e formato do texto', 'Salva neste aparelho e reabre depois', 'Imprimir e baixar PDF', 'Colar lista de itens com pré-visualização'] as const;
const NONE = [] as const;
const READY_texts = ['Editor de texto com formatação, títulos e listas', 'Folha A4 editável e modelo inicial', 'Inserir imagens PNG, JPG ou WebP', 'Salvamento automático na biblioteca do Coding 2.0', 'Exportar HTML e TXT; imprimir ou salvar PDF pelo navegador'] as const;
const READY_calc = NONE, READY_images = NONE, READY_pdf = NONE, READY_codes = NONE, READY_sheet_labels = NONE, READY_draw = NONE, READY_split = NONE;

export const tools: readonly CodingTool[] = [
  { id: 'labels', category: 'labels', ready: READY_labels, name: 'Etiquetas', description: 'Folhas A4, códigos e descrições', color: '#F28B30', textLight: '#A05C20', textDark: '#F28B30', path: '/apps/etiquetas/', legacyHash: '#/etiquetas', status: 'preview', initiallyActive: true, planned: ['Modelos de folha A4 prontos', 'Importar de arquivo (CSV ou planilha)', 'QR e códigos de barras nas etiquetas'] },
  { id: 'texts', category: 'writing', ready: READY_texts, name: 'Texto', description: 'Documentos, formatação e imagens', color: '#4C8DF6', textLight: '#3B6EC0', textDark: '#4C8DF6', path: '/apps/texto/', legacyHash: '#/texto', status: 'preview', initiallyActive: true, planned: ['Tabelas dentro do texto', 'Exportação DOCX', 'Editor de cabeçalhos e rodapés'] },
  { id: 'calc', category: 'data', ready: READY_calc, name: 'Planilhas', description: 'Tabelas, cálculos e fórmulas', color: '#34A853', textLight: '#267C3D', textDark: '#34A853', path: null, legacyHash: '#/planilhas', status: 'planned', initiallyActive: false, planned: ['Tabelas e fórmulas', 'Importação e exportação'] },
  { id: 'images', category: 'media', ready: READY_images, name: 'Imagens', description: 'Edição, molduras, filtros e camadas', color: '#E8538F', textLight: '#BA4272', textDark: '#E8538F', path: null, legacyHash: '#/imagens', status: 'planned', initiallyActive: false, planned: ['Molduras e camadas', 'Filtros e ajustes'] },
  { id: 'pdf', category: 'media', ready: READY_pdf, name: 'Editor PDF', description: 'Organização e anotações em PDF', color: '#E75358', textLight: '#BD4448', textDark: '#E75358', path: null, legacyHash: '#/pdf', status: 'planned', initiallyActive: false, planned: ['Organizar páginas', 'Anotações'] },
  { id: 'codes', category: 'labels', ready: READY_codes, name: 'QR / Barras', description: 'QR codes e códigos de barras', color: '#976DF7', textLight: '#7C59CB', textDark: '#976DF7', path: null, legacyHash: '#/qr', status: 'planned', initiallyActive: false, planned: ['QR codes', 'Códigos de barras'] },
  { id: 'sheet-labels', category: 'labels', ready: READY_sheet_labels, name: 'Planilha → Etiquetas', description: 'Gerar etiquetas com dados de planilhas', color: '#14B8A6', textLight: '#0D796E', textDark: '#14B8A6', path: null, legacyHash: '#/planilha', status: 'planned', initiallyActive: false, planned: ['Etiquetas a partir de linhas de planilha'] },
  { id: 'draw', category: 'fun', ready: READY_draw, name: 'Sorteio', description: 'Roleta, equipes, dados e números', color: '#F5B820', textLight: '#896712', textDark: '#F5B820', path: null, legacyHash: '#/sorteio', status: 'planned', initiallyActive: false, planned: ['Roleta e sorteio de equipes', 'Dados e números'] },
  { id: 'split', category: 'data', ready: READY_split, name: 'Racha-conta', description: 'Divisão de despesas e resumos', color: '#84CC16', textLight: '#4F7A0D', textDark: '#84CC16', path: null, legacyHash: '#/racha', status: 'planned', initiallyActive: false, planned: ['Divisão de despesas', 'Resumo por pessoa'] }
] as const;

export const isToolId = (value: unknown): value is ToolId => typeof value === 'string' && tools.some((tool) => tool.id === value);

export const findTool = (id: string): CodingTool | undefined => tools.find((item) => item.id === id);

export const getTool = (id: ToolId): CodingTool => {
  const tool = findTool(id);
  if (!tool) throw new Error('Ferramenta desconhecida: ' + id);
  return tool;
};

export type Availability = 'functional' | 'preview' | 'planned';
export const availabilityOf = (tool: CodingTool): Availability => (tool.status !== 'preview' ? 'planned' : tool.ready.length ? 'functional' : 'preview');
export const availabilityLabel: Record<Availability, string> = { functional: 'Editor funcional', preview: 'Prévia visual', planned: 'Em breve' };

export const isPreviewTool = (tool: CodingTool): boolean => tool.status === 'preview';
