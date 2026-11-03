import type { VersionRecord } from './versions';

/**
 * Histórico oficial de versões — ÚNICA fonte de dados da Central de Versões, de Ajustes → Sobre e dos Detalhes de cada app.
 *
 * Como lançar uma versão nova:
 *   1. rode `node scripts/stamp-build.mjs` para obter a compilação (DD.MM.AA.HHMMSS) e a data/hora atuais de São Paulo;
 *   2. acrescente UM registro abaixo (o mais recente pode ficar em qualquer posição: a lista é ordenada pela data de lançamento);
 *   3. escreva só as seções que tiverem conteúdo (novidades, melhorias, correções, alterações técnicas, problemas conhecidos);
 *   4. `npm run test:unit` valida o formato de versão, a compilação e as datas.
 * A versão principal muda apenas aqui, em um lançamento registrado — não a cada publicação. Cada app tem a sua própria linha do tempo.
 *
 * Os registros iniciais dos apps usam como compilação, data e hora o último commit que alterou o código de cada app no
 * repositório (America/Sao_Paulo); `commit` aponta para esse commit.
 */
export const versionRecords: readonly VersionRecord[] = [
  {
    target: 'versos', version: '1.0.2', build: '03.11.26.110835', releaseDate: '2026-11-03', releaseTime: '11:08:35',
    melhorias: [
      'Imprimir cena atual ou todas as cenas, uma cena por página, com a composição final e sem a interface (Arquivo → Imprimir, Ctrl+P).',
      'Orientação da página escolhida automaticamente pela proporção da cena; margens e proporções preservadas.'
    ]
  },
  {
    target: 'images', version: '1.0.1', build: '03.11.26.110835', releaseDate: '2026-11-03', releaseTime: '11:08:35',
    melhorias: [
      'Imprimir a composição final (Arquivo → Imprimir, Ctrl+P), sem a interface do editor nem áreas vazias, com orientação e proporção respeitadas.',
      'Exportações e PDF continuam como antes.'
    ]
  },
  {
    target: 'paint', version: '1.0.1', build: '03.11.26.110835', releaseDate: '2026-11-03', releaseTime: '11:08:35',
    melhorias: [
      'Imprimir a composição final da tela (Arquivo → Imprimir, Ctrl+P), sem a interface, com fundo branco e proporção preservada.'
    ]
  },
  {
    target: 'viewer', version: '1.0.1', build: '03.11.26.110835', releaseDate: '2026-11-03', releaseTime: '11:08:35',
    melhorias: [
      'Imprimir o arquivo atual por formato: imagem, PDF (todas as páginas), texto e código, quadro do vídeo, capa de áudio e vista atual do 3D — nunca os controles de vídeo, áudio ou 3D.'
    ]
  },
  {
    target: 'pdf', version: '1.0.1', build: '03.11.26.110835', releaseDate: '2026-11-03', releaseTime: '11:08:35',
    melhorias: [
      'Imprimir o PDF aberto, página a página, com o tamanho de cada página respeitado e sem a interface (Arquivo → Imprimir, Ctrl+P).'
    ]
  },
  {
    target: 'labels', version: '1.1.1', build: '03.11.26.110835', releaseDate: '2026-11-03', releaseTime: '11:08:35',
    melhorias: [
      'Ctrl+P e Imprimir agora usam a infraestrutura de impressão compartilhada; a folha impressa continua apenas com as etiquetas.'
    ]
  },
  {
    target: 'texts', version: '1.0.1', build: '03.11.26.110835', releaseDate: '2026-11-03', releaseTime: '11:08:35',
    melhorias: [
      'Imprimir só o texto, sem menus ou painéis (Arquivo → Imprimir, Ctrl+P).'
    ]
  },
  {
    target: 'calc', version: '1.0.1', build: '03.11.26.110835', releaseDate: '2026-11-03', releaseTime: '11:08:35',
    melhorias: [
      'Imprimir só a planilha, sem a interface (Arquivo → Imprimir, Ctrl+P).'
    ]
  },
  {
    target: 'codes', version: '1.0.1', build: '03.11.26.110835', releaseDate: '2026-11-03', releaseTime: '11:08:35',
    melhorias: [
      'Imprimir só o código gerado, sem a interface (Arquivo → Imprimir, Ctrl+P).'
    ]
  },
  {
    target: 'split', version: '1.1.1', build: '03.11.26.110835', releaseDate: '2026-11-03', releaseTime: '11:08:35',
    melhorias: [
      'Imprimir o resumo da divisão em página própria, sem a interface; Ctrl+P e menu integrados.'
    ]
  },
  {
    target: 'draw', version: '1.1.2', build: '03.11.26.110835', releaseDate: '2026-11-03', releaseTime: '11:08:35',
    melhorias: [
      'Imprimir o desenho em escala, sem a interface (Arquivo → Imprimir, Ctrl+P).'
    ]
  },
  {
    target: 'calculator', version: '1.1.1', build: '03.11.26.110835', releaseDate: '2026-11-03', releaseTime: '11:08:35',
    melhorias: [
      'Imprimir o histórico de cálculos, sem a interface (Arquivo → Imprimir, Ctrl+P).'
    ]
  },
  {
    target: 'colors', version: '1.1.1', build: '03.11.26.110835', releaseDate: '2026-11-03', releaseTime: '11:08:35',
    melhorias: [
      'Imprimir a paleta de cores, sem a interface (Arquivo → Imprimir, Ctrl+P).'
    ]
  },
  {
    target: 'zip', version: '1.1.1', build: '03.11.26.110835', releaseDate: '2026-11-03', releaseTime: '11:08:35',
    melhorias: [
      'Imprimir a lista de conteúdo do pacote, sem a interface (Arquivo → Imprimir, Ctrl+P).'
    ]
  },
  {
    target: 'compare', version: '1.1.1', build: '03.11.26.110835', releaseDate: '2026-11-03', releaseTime: '11:08:35',
    melhorias: [
      'Imprimir o resultado da comparação, sem a interface (Arquivo → Imprimir, Ctrl+P).'
    ]
  },
  {
    target: 'code', version: '1.0.1', build: '03.11.26.110835', releaseDate: '2026-11-03', releaseTime: '11:08:35',
    melhorias: [
      'Imprimir o código, sem a interface (Arquivo → Imprimir, Ctrl+P).'
    ]
  },
  {
    target: 'launcher', version: '2.2.0', build: '03.11.26.110835', releaseDate: '2026-11-03', releaseTime: '11:08:35',
    novidades: [
      'Impressão nativa padronizada: todos os apps com conteúdo imprimível têm Arquivo → Imprimir e Ctrl+P, e imprimem só o conteúdo, nunca a interface.'
    ],
    melhorias: [
      'Item Imprimir no menu de contexto e Ctrl+P na lista de atalhos dos apps com conteúdo imprimível.'
    ],
    alteracoesTecnicas: [
      'Infraestrutura compartilhada de impressão em src/shared/print (provedores built e dom, @page por tamanho e orientação).',
      'Testes automatizados geram o PDF real e conferem páginas, tamanho, conteúdo e ausência de elementos da interface.'
    ]
  },
  {
    target: 'versos', version: '1.0.1', build: '28.10.26.235345', releaseDate: '2026-10-28', releaseTime: '23:53:45',
    melhorias: [
      'No celular, o player musical fica compacto depois da importação: a prévia volta a ocupar o espaço principal.',
      'Controle rápido de Play/Pause, nome do arquivo, andamento e tempo da música diretamente na barra recolhida.',
      'Cabeçalho, navegação de cenas, barra de zoom e gaveta de ferramentas mais compactos no celular.'
    ],
    correcoes: [
      'Ajustado o zoom automático ao espaço disponível da prévia, inclusive ao abrir ou fechar ferramentas.',
      'Ao trocar de cena, a música continua tocando normalmente.',
      'Avisos de arquivos grandes e erros de reprodução continuam acessíveis mesmo com o player compacto.',
      'Alvos de toque da navegação preservados com pelo menos 44 px.'
    ],
    alteracoesTecnicas: [
      'Atualização do player reduzida para oito vezes por segundo para economizar processamento.',
      'Incluídos testes automatizados de regressão mobile, player musical e visualização da prévia.'
    ],
    prUrl: 'https://github.com/outbassed/Coding/pull/16', commit: '3b1ba936fd67f35eccefeca2aa51e49664f2744a'
  },
  {
    target: 'launcher', version: '2.0.0', build: '25.10.26.232332', releaseDate: '2026-10-25', releaseTime: '23:23:32',
    novidades: [
      'Central de Versões em /versoes/, com o histórico do Launcher e de cada aplicativo.',
      'Ajustes organizados em abas: Geral, Aparência, Projetos, Offline, Atalhos, Avançado e Sobre.',
      'Início rápido, com busca, aplicativos e documentos recentes.',
      'Gerenciamento offline em cada aplicativo, na página de Detalhes.'
    ],
    melhorias: [
      'Todos os aplicativos ficam sempre disponíveis: não é preciso ativar nem desativar nada.',
      'Instalar, atualizar, reparar e desinstalar o uso offline em um só lugar, sincronizado entre Detalhes e Ajustes.'
    ],
    alteracoesTecnicas: [
      'Versionamento independente: o Launcher e cada aplicativo têm versão (semver) e compilação (DD.MM.AA.HHMMSS) próprias.',
      'A preferência antiga de ativação é lida uma única vez e ignorada; nenhum outro dado é apagado.'
    ]
  },
  {
    target: 'launcher', version: '2.1.0', build: '01.11.26.154342', releaseDate: '2026-11-01', releaseTime: '15:43:42',
    novidades: [
      'Início virou um resumo do Coding: continuar de onde parou, favoritos, o que há neste aparelho, sugestões do Catálogo e as últimas novidades da Central de Versões.',
      'Catálogo em vitrine, com um bloco por categoria; ao buscar ou filtrar, volta a lista simples.',
      'Meus apps mostra só os aplicativos instalados para uso offline neste navegador, com a contagem e o aviso de atualizações.'
    ],
    melhorias: ['A busca do Início mostra os aplicativos encontrados e some ao limpar o campo, devolvendo o resumo.'],
    alteracoesTecnicas: ['Nenhum dado das pessoas é lido de outra forma ou alterado: favoritos, documentos e instalações offline continuam como estavam.']
  },
  { target: 'labels', version: '1.0.0', build: '25.10.26.161502', releaseDate: '2026-10-25', releaseTime: '16:15:02', commit: 'eb7541c', novidades: ['Versão inicial registrada na Central de Versões.'] },
  {
    target: 'labels', version: '1.0.1', build: '01.11.26.150134', releaseDate: '2026-11-01', releaseTime: '15:01:34',
    correcoes: ['Corrigido o fundo vazio que aparecia embaixo do editor ao rolar com o mouse quando havia vários itens: a página não rola mais por baixo do editor.'],
    alteracoesTecnicas: ['A área de medição das etiquetas, que fica fora da tela, deixou de aumentar a altura rolável da página, e o editor passou a recortar o que excede a janela.']
  },
  {
    target: 'labels', version: '1.1.0', build: '01.11.26.202745', releaseDate: '2026-11-01', releaseTime: '20:27:45',
    novidades: [
      'Edição direta: clique ou toque no código ou na descrição de qualquer etiqueta da folha e edite ali mesmo. O painel, o desfazer e todas as cópias do item acompanham na hora.',
      'Enter confirma o código; na descrição, Enter quebra a linha e Ctrl+Enter confirma. Esc cancela a edição. No celular, o botão Concluir edição fecha o teclado e o painel dá lugar à folha enquanto você edita.'
    ],
    alteracoesTecnicas: ['Primeiro app a usar o contrato de edição direta (EDICAO-DIRETA.md). A edição só existe na prévia: a medição, a impressão e o PDF continuam usando a etiqueta somente leitura, e o documento salvo não mudou de formato.']
  },
  {
    target: 'texts', version: '1.0.0', build: '25.10.26.180914', releaseDate: '2026-10-25', releaseTime: '18:09:14', commit: '600c643',
    novidades: ['Versão inicial registrada na Central de Versões.', 'Links em documentos e estrutura de títulos.']
  },
  { target: 'calc', version: '1.0.0', build: '25.10.26.162157', releaseDate: '2026-10-25', releaseTime: '16:21:57', commit: 'd63a665', novidades: ['Versão inicial registrada na Central de Versões.'] },
  { target: 'images', version: '1.0.0', build: '25.10.26.162323', releaseDate: '2026-10-25', releaseTime: '16:23:23', commit: '61668ed', novidades: ['Versão inicial registrada na Central de Versões.'] },
  {
    target: 'pdf', version: '1.0.0', build: '25.10.26.175018', releaseDate: '2026-10-25', releaseTime: '17:50:18', commit: 'badc025',
    novidades: ['Versão inicial registrada na Central de Versões.', 'Anotações no PDF: desenho à mão livre e imagens.']
  },
  {
    target: 'codes', version: '1.0.0', build: '25.10.26.181535', releaseDate: '2026-10-25', releaseTime: '18:15:35', commit: 'c6ff909',
    novidades: ['Versão inicial registrada na Central de Versões.', 'Assistente de conteúdo para códigos QR.']
  },
  {
    target: 'draw', version: '1.0.0', build: '25.10.26.180914', releaseDate: '2026-10-25', releaseTime: '18:09:14', commit: '600c643',
    novidades: ['Versão inicial registrada na Central de Versões.']
  },
  { target: 'split', version: '1.0.0', build: '24.10.26.112915', releaseDate: '2026-10-24', releaseTime: '11:29:15', commit: '8171e4d', novidades: ['Versão inicial registrada na Central de Versões.'] },
  {
    target: 'draw', version: '1.1.0', build: '01.11.26.183839', releaseDate: '2026-11-01', releaseTime: '18:38:39',
    novidades: ['Nova tela pensada para sortear: a roleta (ou os números, dados e equipes) no centro, os participantes ao lado e o histórico sempre à vista no computador; no celular, o botão de girar fica na primeira tela.'],
    alteracoesTecnicas: ['Layout livre da casca dos editores: o app organiza a própria tela; controles, atalhos, salvamento e documentos não mudaram.']
  },
  {
    target: 'draw', version: '1.1.1', build: '01.11.26.194630', releaseDate: '2026-11-01', releaseTime: '19:46:30',
    novidades: ['No celular, as cinco abas (Roleta, Números, Dados, Equipes e Arquivo) ficam fixas no topo ao rolar, com os nomes inteiros e botões grandes; a aba Arquivo mostra suas funções logo abaixo.'],
    alteracoesTecnicas: ['Abas segmentadas de largura total ficam mais compactas em telas estreitas (mesma barra usada por outros aplicativos de layout livre); nenhum dado ou função mudou.']
  },
  {
    target: 'split', version: '1.1.0', build: '01.11.26.183839', releaseDate: '2026-11-01', releaseTime: '18:38:39',
    novidades: ['Nova tela pensada para rachar a conta: o total no alto, pessoas e despesas à esquerda e os acertos e saldos sempre à vista à direita; no celular, abas Despesas, Pessoas, Acertos e Arquivo.'],
    alteracoesTecnicas: ['Layout livre da casca dos editores: o app organiza a própria tela; controles, atalhos, salvamento e documentos não mudaram.']
  },
  {
    target: 'calculator', version: '1.1.0', build: '01.11.26.173757', releaseDate: '2026-11-01', releaseTime: '17:37:57',
    novidades: ['Nova tela pensada para calcular: visor e teclado ocupam a tela inteira, no computador, no tablet e no celular.'],
    melhorias: ['Histórico, variáveis e arquivo ficam numa coluna ao lado no computador e numa gaveta ("Histórico e mais") no tablet e no celular.'],
    alteracoesTecnicas: ['A casca dos editores ganhou o modo de layout livre, em que cada aplicativo organiza a própria tela; controles, atalhos, salvamento e documentos não mudaram.']
  },
  {
    target: 'colors', version: '1.1.0', build: '01.11.26.173757', releaseDate: '2026-11-01', releaseTime: '17:37:57',
    novidades: ['Nova tela pensada para cores: a cor atual em destaque, a edição ao lado, a bancada de ferramentas por abas e a paleta sempre à mão.'],
    alteracoesTecnicas: ['A casca dos editores ganhou o modo de layout livre, em que cada aplicativo organiza a própria tela; controles, atalhos, salvamento e documentos não mudaram.']
  },
  {
    target: 'zip', version: '1.1.0', build: '01.11.26.173757', releaseDate: '2026-11-01', releaseTime: '17:37:57',
    novidades: ['Nova tela pensada para arquivos: a lista de arquivos e as operações (compactar, abrir ZIP, arquivo) ficam lado a lado, sem trocar de aba para ver o que foi adicionado.'],
    alteracoesTecnicas: ['A casca dos editores ganhou o modo de layout livre, em que cada aplicativo organiza a própria tela; controles, atalhos, salvamento e documentos não mudaram.']
  },
  {
    target: 'compare', version: '1.1.0', build: '01.11.26.173757', releaseDate: '2026-11-01', releaseTime: '17:37:57',
    novidades: ['Nova tela pensada para comparar: os lados A e B lado a lado, as opções numa barra e o resultado logo abaixo; no celular, abas Lado A, Lado B e Resultado.'],
    alteracoesTecnicas: ['A casca dos editores ganhou o modo de layout livre, em que cada aplicativo organiza a própria tela; controles, atalhos, salvamento e documentos não mudaram.']
  },
  { target: 'calculator', version: '1.0.0', build: '25.10.26.004528', releaseDate: '2026-10-25', releaseTime: '00:45:28', commit: '627ad2c', novidades: ['Versão inicial registrada na Central de Versões.'] },
  { target: 'colors', version: '1.0.0', build: '25.10.26.164408', releaseDate: '2026-10-25', releaseTime: '16:44:08', commit: '63add2d', novidades: ['Versão inicial registrada na Central de Versões.'] },
  { target: 'zip', version: '1.0.0', build: '25.10.26.010744', releaseDate: '2026-10-25', releaseTime: '01:07:44', commit: '6709855', novidades: ['Versão inicial registrada na Central de Versões.'] },
  { target: 'compare', version: '1.0.0', build: '25.10.26.010744', releaseDate: '2026-10-25', releaseTime: '01:07:44', commit: '6709855', novidades: ['Versão inicial registrada na Central de Versões.'] },
  { target: 'code', version: '1.0.0', build: '25.10.26.172841', releaseDate: '2026-10-25', releaseTime: '17:28:41', commit: '78ac1f4', novidades: ['Versão inicial registrada na Central de Versões.'] },
  { target: 'paint', version: '1.0.0', build: '25.10.26.170932', releaseDate: '2026-10-25', releaseTime: '17:09:32', commit: '74d1e39', novidades: ['Versão inicial registrada na Central de Versões.'] },
  {
    target: 'viewer', version: '1.0.0', build: '25.10.26.174525', releaseDate: '2026-10-25', releaseTime: '17:45:25', commit: 'c93f2f3',
    novidades: ['Versão inicial registrada na Central de Versões.', 'Visualização de imagens, áudio e vídeo.']
  },
  {
    target: 'versos', version: '1.0.0', build: '28.10.26.211555', releaseDate: '2026-10-28', releaseTime: '21:15:55',
    novidades: [
      'Editor de composição tipográfica para imagens: letras de música, frases, citações e títulos, em dezenas de cenas ou numa só imagem.',
      'Cenas independentes, cada uma com seus textos, fundo, proporção e resolução, com miniaturas, duplicar, copiar, colar, recortar e reordenar.',
      'Vários textos por cena com fonte, tamanho, peso, cor, contorno, sombra, posição, rotação e ordem de camadas, mais estilos prontos e copiar/colar formatação.',
      'Exporta PNG da cena, de todas as cenas, só os textos com fundo transparente ou um ZIP, cada cena na própria resolução.',
      'Música ou vídeo de referência opcional (só o áudio), que não vai para o projeto e para ao sair do Versos.',
      'Fontes livres (licença OFL) incluídas no aplicativo, que funcionam offline.'
    ],
    alteracoesTecnicas: [
      'Limites de áudio, vídeo e imagem importados configuráveis em Ajustes → Projetos.',
      'Pronto para receber fontes de um futuro Coding Fontes sem alterar os projetos já salvos.'
    ],
    problemasConhecidos: [
      'Os formatos de áudio e vídeo aceitos dependem do navegador.',
      'O ZIP de exportação é limitado a 200 MB.'
    ]
  },
];
