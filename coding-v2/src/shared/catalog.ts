export type ToolId = 'labels' | 'texts' | 'calc' | 'images' | 'pdf' | 'codes' | 'draw' | 'split' | 'calculator' | 'colors' | 'zip' | 'compare' | 'code' | 'viewer' | 'paint';

/**
 * preview: o app tem página própria no Launcher. Com `ready` preenchido, o editor é funcional.
 * planned: reservado para apps ainda não construídos. Todos os apps ficam sempre disponíveis online;
 * o uso offline é uma instalação à parte, por app (veja src/stores/offline.ts).
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
  /** Rota equivalente em versões anteriores (hash), usada para reconhecer documentos antigos; nulo para apps mais novos. */
  legacyHash: string | null;
  status: ToolStatus;
  /** O que o app deverá oferecer; é planejamento, não funcionalidade entregue. */
  planned: readonly string[];
}

export const INK = '#141922';

const READY_labels = ['Editor de código e descrição por item', 'QR ou código de barras dentro das etiquetas', 'Modelos e importação de CSV/XLSX com escolha de colunas', 'Folha A4 ao vivo, retrato ou paisagem', 'Colunas, espaçamento e formato do texto', 'Salva neste aparelho e reabre depois', 'Imprimir e baixar PDF', 'Colar lista de itens com pré-visualização'] as const;
const READY_texts = ['Editor de texto com formatação, títulos e listas', 'Folha A4 editável e modelo inicial', 'Inserir imagens PNG, JPG ou WebP', 'Salvamento automático na biblioteca do Coding', 'Exportar HTML e TXT; imprimir ou salvar PDF pelo navegador'] as const;
const READY_calc = ['Grade editável com várias abas', 'Fórmulas com referências (SOMA, MÉDIA, MÍNIMO, MÁXIMO, SE e mais)', 'Formatos de número, moeda e porcentagem', 'Importar e exportar CSV e XLSX', 'Preencher para baixo e classificar', 'Modelos de orçamento e tabela de produtos'] as const;
const READY_images = ['Camadas de imagem, texto e formas', 'Recortar, redimensionar, girar e espelhar', 'Brilho, contraste, saturação e filtros prontos', 'Desfazer, refazer e zoom', 'Exportar PNG, JPG e WebP'] as const;
const READY_pdf = ['Abrir PDFs e ver miniaturas das páginas', 'Juntar, dividir e extrair páginas', 'Reordenar, girar, duplicar e remover páginas', 'Anotações de texto, destaque e retângulo', 'Baixar um PDF novo sem alterar o original'] as const;
const READY_codes = ['QR code, Code 128, EAN-13, EAN-8, UPC-A e Code 39', 'Validação com dígito verificador', 'Tamanho, cores, margem e legenda', 'Baixar PNG e SVG', 'Folha A4 para imprimir'] as const;
const READY_draw = ['Roleta animada (respeita “reduzir movimento”)', 'Números, dados e equipes', 'Não repetir quem já foi sorteado', 'Histórico salvo no documento', 'Modelos prontos para editar'] as const;
const READY_split = ['Pessoas e despesas', 'Divisão igual, por porcentagem ou por valores', 'Saldos e acertos sugeridos', 'Cálculos em centavos inteiros', 'Exportar CSV e TXT; imprimir'] as const;
const READY_colors = ['Cor atual em HEX, RGB, HSL, HSV e CMYK, com seletor, sliders e conta-gotas (quando o navegador permite)', 'Harmonias: complementar, análoga, tríade, tétrade, dividida, monocromática e escala de tons', 'Verificador de contraste WCAG com sugestão de texto', 'Extração das cores dominantes de uma imagem, feita só neste aparelho', 'Paleta salva com nomes, exportada em CSS, JSON, SVG ou TXT'] as const;
const READY_zip = ['Junte vários arquivos num único .zip e escolha entre compactar ou só agrupar', 'Abra um .zip, veja o conteúdo e extraia só o que precisar', 'Teste de integridade (tamanho e CRC-32) de cada arquivo', 'Recusa ZIPs com senha, corrompidos ou perigosos; nomes de caminho são limpos', 'Tudo no aparelho: os arquivos do projeto ficam salvos, nada é enviado'] as const;
const READY_compare = ['Compara dois textos linha a linha (algoritmo de Myers) com destaque por palavra, lado a lado ou unificado', 'Ignora maiúsculas, espaços e linhas em branco, e nunca conta Windows × Linux como diferença', 'Arquivos que não são texto: byte a byte, com a primeira diferença em hexadecimal', 'Tamanho e SHA-256 de cada lado', 'Exporta as diferenças (.diff, igual ao diff -u) e um relatório'] as const;
const READY_code = ['Projeto com vários arquivos e pastas: explorador para criar, renomear, mover e excluir', 'Editor com numeração de linhas, realce de sintaxe, fechamento automático de parênteses e aspas, Tab, recuo e Ctrl+Enter para executar', 'Localizar e substituir no arquivo ou em todo o projeto', 'Importar arquivos, pasta ou ZIP; imagens, fontes e JSON do projeto funcionam na página', 'Resultado numa página isolada (sandbox sem allow-same-origin), sem rede e sem acesso aos seus documentos, com console e navegação entre páginas', 'Baixar o projeto em ZIP ou como página única', 'Modelos prontos: contador, cartão, lista de tarefas e site com páginas e pastas'] as const;
const READY_viewer = ['Abre imagens, vídeo e áudio, com zoom, giro, fundo e velocidade', 'SVG sanitizado: sem scripts, sem links e sem recursos externos', 'Modelos 3D (STL, OBJ e GLB) com giro, zoom e arestas, calculados neste aparelho', 'PDF página a página e arquivos de texto com números de linha e JSON formatado', 'Reconhece o tipo pelo conteúdo, não só pelo nome; arquivos desconhecidos mostram os primeiros bytes'] as const;
const READY_paint = ['Camadas com visibilidade, opacidade, ordem, duplicar, mesclar e limpar', 'Pincel, borracha, linha, retângulo, elipse, balde com tolerância e conta-gotas', 'Desfazer e refazer até 100 passos, incluindo operações de camada e tamanho da tela', 'Importe imagens como camadas (arquivo, Ctrl+V ou arrastar) e exporte PNG, JPG ou WebP', 'Tela de 16 a 4096 px por lado, com fundo sólido ou transparente; tudo calculado neste aparelho'] as const;
const READY_calculator = ['Modo Básico (teclado, memória e porcentagem) e modo Pro (funções científicas)', 'Leitor de expressões próprio e seguro: nada é executado como código', 'Graus ou radianos, casas decimais e variáveis com nome', 'Histórico salvo com reuso da conta ou do resultado', 'Copiar resultado e exportar o histórico'] as const;

export const tools: readonly CodingTool[] = [
  { id: 'labels', category: 'labels', ready: READY_labels, name: 'Etiquetas', description: 'Folhas A4, códigos e descrições', color: '#F28B30', textLight: '#A05C20', textDark: '#F28B30', path: '/apps/etiquetas/', legacyHash: '#/etiquetas', status: 'preview', planned: ['Etiquetas com tamanhos de papel adesivo prontos (Pimaco)'] },
  { id: 'texts', category: 'writing', ready: READY_texts, name: 'Texto', description: 'Documentos, formatação e imagens', color: '#4C8DF6', textLight: '#3B6EC0', textDark: '#4C8DF6', path: '/apps/texto/', legacyHash: '#/texto', status: 'preview', planned: ['Cabeçalhos e rodapés', 'Comentários e revisão'] },
  { id: 'calc', category: 'data', ready: READY_calc, name: 'Planilhas', description: 'Tabelas, cálculos e fórmulas', color: '#34A853', textLight: '#267C3D', textDark: '#34A853', path: '/apps/planilhas/', legacyHash: '#/planilhas', status: 'preview', planned: ['Gráficos', 'Filtros por coluna', 'Mesclar células'] },
  { id: 'images', category: 'media', ready: READY_images, name: 'Imagens', description: 'Edição, molduras, filtros e camadas', color: '#27B4CF', textLight: '#0E7490', textDark: '#27B4CF', path: '/apps/imagens/', legacyHash: '#/imagens', status: 'preview', planned: ['Pincel e borracha', 'Remover fundo automaticamente'] },
  { id: 'pdf', category: 'media', ready: READY_pdf, name: 'Editor PDF', description: 'Organização e anotações em PDF', color: '#E75358', textLight: '#BD4448', textDark: '#E75358', path: '/apps/pdf/', legacyHash: '#/pdf', status: 'preview', planned: ['Assinatura desenhada', 'Preencher formulários de PDF'] },
  { id: 'codes', category: 'labels', ready: READY_codes, name: 'QR / Barras', description: 'QR codes e códigos de barras', color: '#976DF7', textLight: '#7C59CB', textDark: '#976DF7', path: '/apps/qr/', legacyHash: '#/qr', status: 'preview', planned: ['Data Matrix e PDF417', 'Gerar em lote a partir de planilha'] },
  { id: 'draw', category: 'fun', ready: READY_draw, name: 'Sorteio', description: 'Roleta, equipes, dados e números', color: '#F5B820', textLight: '#896712', textDark: '#F5B820', path: '/apps/sorteio/', legacyHash: '#/sorteio', status: 'preview', planned: ['Sorteio com pesos', 'Exportar o resultado como imagem'] },
  { id: 'split', category: 'data', ready: READY_split, name: 'Racha-conta', description: 'Divisão de despesas e resumos', color: '#84CC16', textLight: '#4F7A0D', textDark: '#84CC16', path: '/apps/racha-conta/', legacyHash: '#/racha', status: 'preview', planned: ['Várias moedas', 'Compartilhar o resumo por link'] },
  { id: 'calculator', category: 'fun', ready: READY_calculator, name: 'Calculadora', description: 'Básica e Pro, com histórico', color: '#7C8BFF', textLight: '#4351C8', textDark: '#7C8BFF', path: '/apps/calculadora/', legacyHash: null, status: 'preview', planned: ['Conversão de unidades', 'Calculadora financeira e de datas'] },
  { id: 'colors', category: 'fun', ready: READY_colors, name: 'Estúdio de Cores', description: 'Paletas, harmonias e contraste', color: '#EC6FB5', textLight: '#B02F7C', textDark: '#EC6FB5', path: '/apps/cores/', legacyHash: null, status: 'preview', planned: ['Paletas a partir de URLs de sites', 'Simulação de daltonismo'] },
  { id: 'zip', category: 'data', ready: READY_zip, name: 'Compactador ZIP', description: 'Criar, abrir e conferir arquivos ZIP', color: '#2DB89C', textLight: '#0E7562', textDark: '#2DB89C', path: '/apps/zip/', legacyHash: null, status: 'preview', planned: ['ZIP com senha', 'Arrastar e soltar pastas inteiras'] },
  { id: 'compare', category: 'data', ready: READY_compare, name: 'Comparador de Arquivos', description: 'Diferenças entre textos e arquivos', color: '#8FA6C2', textLight: '#4A6A8F', textDark: '#8FA6C2', path: '/apps/comparador/', legacyHash: null, status: 'preview', planned: ['Comparar pastas inteiras', 'Mesclar as diferenças'] },
  { id: 'code', category: 'fun', ready: READY_code, name: 'Código', description: 'HTML, CSS e JavaScript com visualização', color: '#4CC2A0', textLight: '#0E7A5E', textDark: '#4CC2A0', path: '/apps/codigo/', legacyHash: null, status: 'preview', planned: ['Módulos com import entre arquivos', 'Destaque do par de parênteses'] },
  { id: 'viewer', category: 'media', ready: READY_viewer, name: 'Visualizador', description: 'Imagens, vídeo, áudio, 3D, PDF e texto', color: '#D98BE8', textLight: '#8A3FA0', textDark: '#D98BE8', path: '/apps/visualizador/', legacyHash: null, status: 'preview', planned: ['Anotações sobre imagens', 'Mais formatos 3D'] },
  { id: 'paint', category: 'media', ready: READY_paint, name: 'Pintar', description: 'Desenho em camadas, balde e exportação', color: '#F2A65A', textLight: '#9A4A00', textDark: '#F2A65A', path: '/apps/pintar/', legacyHash: null, status: 'preview', planned: ['Seleção e recorte', 'Texto sobre o desenho'] }
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
export const availabilityLabel: Record<Availability, string> = { functional: 'Editor funcional', preview: 'Em desenvolvimento', planned: 'Em breve' };

export const isPreviewTool = (tool: CodingTool): boolean => tool.status === 'preview';
