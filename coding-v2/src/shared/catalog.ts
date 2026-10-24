export type ToolId = 'labels' | 'texts' | 'calc' | 'images' | 'pdf' | 'codes' | 'sheet-labels' | 'draw' | 'split';

/**
 * preview: o app existe no Coding 2.0 (Prévia). Com `ready` preenchido, o editor é funcional.
 * planned: ainda só existe na versão estável. Ativar um app NÃO instala nada nem garante uso offline.
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
const READY_texts = ['Editor de texto com formatação, títulos e listas', 'Folha A4 editável e modelo inicial', 'Inserir imagens PNG, JPG ou WebP', 'Salvamento automático na biblioteca do Coding 2.0', 'Exportar HTML e TXT; imprimir ou salvar PDF pelo navegador'] as const;
const READY_calc = ['Grade editável com várias abas', 'Fórmulas com referências (SOMA, MÉDIA, MÍNIMO, MÁXIMO, SE e mais)', 'Formatos de número, moeda e porcentagem', 'Importar e exportar CSV e XLSX', 'Modelos de orçamento e tabela de produtos'] as const;
const READY_images = ['Camadas de imagem, texto e formas', 'Recortar, redimensionar, girar e espelhar', 'Brilho, contraste, saturação e filtros prontos', 'Desfazer, refazer e zoom', 'Exportar PNG, JPG e WebP'] as const;
const READY_pdf = ['Abrir PDFs e ver miniaturas das páginas', 'Juntar, dividir e extrair páginas', 'Reordenar, girar, duplicar e remover páginas', 'Anotações de texto, destaque e retângulo', 'Baixar um PDF novo sem alterar o original'] as const;
const READY_codes = ['QR code, Code 128, EAN-13, EAN-8, UPC-A e Code 39', 'Validação com dígito verificador', 'Tamanho, cores, margem e legenda', 'Baixar PNG e SVG', 'Folha A4 para imprimir'] as const;
const READY_sheet_labels = ['Planilha de exemplo editável', 'Importar CSV e XLSX', 'Escolher as colunas de código, descrição e quantidade', 'Validação linha a linha e prévia das etiquetas', 'Gerar documento de Etiquetas, PDF ou imprimir'] as const;
const READY_draw = ['Roleta animada (respeita “reduzir movimento”)', 'Números, dados e equipes', 'Não repetir quem já foi sorteado', 'Histórico salvo no documento', 'Modelos prontos para editar'] as const;
const READY_split = ['Pessoas e despesas', 'Divisão igual, por porcentagem ou por valores', 'Saldos e acertos sugeridos', 'Cálculos em centavos inteiros', 'Exportar CSV e TXT; imprimir'] as const;

export const tools: readonly CodingTool[] = [
  { id: 'labels', category: 'labels', ready: READY_labels, name: 'Etiquetas', description: 'Folhas A4, códigos e descrições', color: '#F28B30', textLight: '#A05C20', textDark: '#F28B30', path: '/apps/etiquetas/', legacyHash: '#/etiquetas', status: 'preview', initiallyActive: true, planned: ['QR e códigos de barras dentro das etiquetas'] },
  { id: 'texts', category: 'writing', ready: READY_texts, name: 'Texto', description: 'Documentos, formatação e imagens', color: '#4C8DF6', textLight: '#3B6EC0', textDark: '#4C8DF6', path: '/apps/texto/', legacyHash: '#/texto', status: 'preview', initiallyActive: true, planned: ['Cabeçalhos e rodapés', 'Comentários e revisão'] },
  { id: 'calc', category: 'data', ready: READY_calc, name: 'Planilhas', description: 'Tabelas, cálculos e fórmulas', color: '#34A853', textLight: '#267C3D', textDark: '#34A853', path: '/apps/planilhas/', legacyHash: '#/planilhas', status: 'preview', initiallyActive: true, planned: ['Gráficos', 'Classificar e filtrar', 'Mesclar células'] },
  { id: 'images', category: 'media', ready: READY_images, name: 'Imagens', description: 'Edição, molduras, filtros e camadas', color: '#E8538F', textLight: '#BA4272', textDark: '#E8538F', path: '/apps/imagens/', legacyHash: '#/imagens', status: 'preview', initiallyActive: true, planned: ['Pincel e borracha', 'Remover fundo automaticamente'] },
  { id: 'pdf', category: 'media', ready: READY_pdf, name: 'Editor PDF', description: 'Organização e anotações em PDF', color: '#E75358', textLight: '#BD4448', textDark: '#E75358', path: '/apps/pdf/', legacyHash: '#/pdf', status: 'preview', initiallyActive: true, planned: ['Assinatura desenhada', 'Preencher formulários de PDF'] },
  { id: 'codes', category: 'labels', ready: READY_codes, name: 'QR / Barras', description: 'QR codes e códigos de barras', color: '#976DF7', textLight: '#7C59CB', textDark: '#976DF7', path: '/apps/qr/', legacyHash: '#/qr', status: 'preview', initiallyActive: true, planned: ['Data Matrix e PDF417', 'Gerar em lote a partir de planilha'] },
  { id: 'sheet-labels', category: 'labels', ready: READY_sheet_labels, name: 'Planilha → Etiquetas', description: 'Gerar etiquetas com dados de planilhas', color: '#14B8A6', textLight: '#0D796E', textDark: '#14B8A6', path: '/apps/planilha-etiquetas/', legacyHash: '#/planilha', status: 'preview', initiallyActive: true, planned: ['Código de barras nas etiquetas geradas'] },
  { id: 'draw', category: 'fun', ready: READY_draw, name: 'Sorteio', description: 'Roleta, equipes, dados e números', color: '#F5B820', textLight: '#896712', textDark: '#F5B820', path: '/apps/sorteio/', legacyHash: '#/sorteio', status: 'preview', initiallyActive: true, planned: ['Sorteio com pesos', 'Exportar o resultado como imagem'] },
  { id: 'split', category: 'data', ready: READY_split, name: 'Racha-conta', description: 'Divisão de despesas e resumos', color: '#84CC16', textLight: '#4F7A0D', textDark: '#84CC16', path: '/apps/racha-conta/', legacyHash: '#/racha', status: 'preview', initiallyActive: true, planned: ['Várias moedas', 'Compartilhar o resumo por link'] }
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
