# Roadmap do Coding

Lista de pedidos pendentes. Quando o dono do projeto mandar **"Iniciar update"**, o Claude implementa tudo o que está em **Próximo update**, testa, atualiza o README e envia para a `main`. Depois move os itens concluídos para **Feito**.

## Próximo update

### Planilhas: cor ao vivo (pedido de 18/10)
- Seletor de cor estilo Google Planilhas: botão **Redefinir**, grade de cores prontas (tons de cinza, cores vivas e 5 níveis claros/escuros de cada), linha "padrão" com 8 cores comuns, "cores personalizadas" com + e conta-gotas, e cor mais usada lembrada. Vale para fundo e texto.
- Cor de fundo e do texto mudam enquanto o seletor de cor é arrastado (evento `input`), sem precisar confirmar; o desfazer conta como uma única alteração.

### Tela inicial: selecionar documentos (pedido de 18/10)
- Botão "Selecionar" nos Documentos recentes: marcar um ou vários cartões (caixinha), "Selecionar todos", contador "N selecionados", barra com Excluir (com confirmação), Favoritar e Cancelar. Esc sai do modo. Funciona em grade e em lista, e respeita busca/filtro ("selecionar todos" marca só o que está visível).

### Pesquisa de ferramentas semelhantes (18/10)
- Ideias a aprovar: Scanner/OCR (tesseract.js, Apache-2.0, offline), Câmbio e conversor (Frankfurter, sem chave), CEP/CNPJ/feriados (BrasilAPI), roleta/sorteio, racha-conta, QR criativo, cartão/convite, comprimir PDF e imagem, juntar fotos em PDF.

### Hora oficial de Brasília (pedido de 18/10)
- Relógio/hora real no fuso de Brasília (`America/Sao_Paulo`) ou do estado escolhido (Amazonas, Acre, Fernando de Noronha…), usado em "Hoje/Agora" das Planilhas, datas dos documentos e um mini-relógio. Base: `Intl` com o fuso (funciona offline); API de hora só para corrigir relógio errado do aparelho (a testar qual responde, ex.: worldtimeapi).

### Cartões compactos com ⓘ (pedido de 18/10)
- Nos cartões de documentos, a linha de detalhes fica curta (só a data, ex.: "18 out") e o resto (tipo, nº de células/palavras/etiquetas, data e hora completas) vai num balão que abre pelo ⓘ (toque no celular, passar o mouse/foco no PC).

### Links em português (pedido de 18/10)
- Trocar `#/label/` por `#/etiquetas/` e `#/texts/` por `#/texto/` (e `#/qr/`, `#/pdf/`, `#/imagens/`, `#/planilhas/` seguem em português). Os links antigos (`/label/`, `/texts/`) continuam abrindo, só deixam de ser os principais.

### Lista de melhorias aprovada para análise (18/10)
- Imagens: virar editor simples, estilo Paint + edição básica de foto (só o essencial, sem foco profissional), e consertar o travamento com fotos grandes.
- Planilhas: funções por botão (fx), somar com um toque, sem digitar `;` nem intervalos.
- QR com formulários prontos, Etiquetas com tamanhos prontos, Texto com tabelas/cabeçalho/.docx, PDF com anotações melhores, modelos, pastas e backup geral.

### Ainda fora do Texts (fica para depois)
Tabelas, exportar para `.docx`, cabeçalho/rodapé, comentários, corretor ortográfico próprio (o do navegador continua valendo), recortar e girar imagem, imagem solta sobre o texto (posição livre) e imagem de fundo.

## Ideias ainda não aprovadas
- Salvar modelos próprios (por exemplo "meu padrão" com fontes e tamanhos).
- Duplicar documento na tela inicial.
- Tamanhos de etiqueta fixos (por exemplo 10 × 5 cm).
- Contador "faltam X etiquetas" para completar a última folha.

## Feito
- **Tela inicial estilo Google Docs** (busca, faixa "Iniciar um novo documento", recentes em grade ou lista com miniaturas, filtro por tipo, ordenar, favoritos), **Planilhas** (grade com fórmulas, formatação, CSV/xlsx), nomes **Etiquetas** e **Texto** (sem "Coding"), ícones novos de Início e Ferramentas, foto de exemplo em Imagens (crédito @wsilvasjb / Pexels) e barra lateral recolhida em todos os documentos.
- **Ferramentas como documentos completos**: QR e barras, Etiquetas por planilha, Editor de PDF e Imagens agora têm nome, histórico e favoritos por tipo, links próprios (`#/qr/ID`…), barra do topo igual (Novo, Salvar .json, Abrir, Link), menu de clique direito com submenus e atalhos. PDF e imagens ficam guardados no aparelho e vão dentro do .json.
- **Editor de PDF** (abrir, juntar, girar, mover/arrastar, excluir, extrair, dividir em .zip, anotar com texto/realce/cobrir, assinatura desenhada e imagem) e **Imagens** (redimensionar, cortar por proporção, girar, comprimir, converter JPG/PNG/WebP, baixar em .zip).
- **Ícones coloridos** próprios para cada programa e **interruptores** na página Ferramentas que mostram/ocultam cada programa na barra lateral (Início e Ferramentas sempre fixos).
- **Ferramentas: QR e código de barras** (QR, Code 128 e EAN-13 em folha A4, colunas, tamanho, legenda, linha de corte, impressão/PDF) e **Etiquetas por planilha** (.xlsx, .csv ou colar do Excel; escolhe as colunas e cria um documento de Etiquetas). Rotas `#/ferramentas/codigos` e `#/ferramentas/planilha`.
- **Layout separado PC/celular**: barra lateral no PC (recolhe para ícones dentro do documento) e barra inferior no celular (Início, Novo, Ferramentas, Menu, com folha "Criar novo"); página **Ferramentas** (`#/ferramentas`) com as ferramentas futuras marcadas "Em breve".
- Vários itens por documento, colar lista, 1 a 3 colunas, linha de corte.
- Retrato e paisagem, zoom que mostra a página inteira, editor recolhível.
- Tela inicial (Continuar editando / Criar um novo) e biblioteca de documentos.
- PWA instalável e offline.
- Links diretos (`#/novo`, `#/continuar`, `#/doc/…`) e link de compartilhamento.
- **Modos Etiquetas e Texts**, com a escolha na tela inicial, ícone por tipo na biblioteca e links `#/novo/etiquetas` e `#/novo/texts` (`#/novo` continua sendo Etiquetas).
- **Coding Texts**: folha A4 retrato/paisagem, negrito, itálico, sublinhado, fonte, tamanho, cor, alinhamento e justificado, títulos 1 e 2, listas, desfazer/refazer, colar sem formatação, contador de palavras e páginas, marcas de fim de página, impressão/PDF.
- **Imagens no Texts**: inserir por arquivo, galeria/câmera, Ctrl+V ou arrastando; alças e barra (largura, alinhamento, substituir, remover); redução para 1600 px; quadro "Imagem indisponível" com botão Substituir; limite de 30 imagens.
- **Biblioteca em IndexedDB**, com migração automática dos documentos antigos e reserva em `localStorage`; `.json` leva as imagens, o link de compartilhamento não.
- **Menu de clique direito** com atalhos por contexto, toque longo, teclado e acessibilidade; atalhos Ctrl+P, Ctrl+S, Alt+N, Alt+H e `?`.
- **Tela de carregamento** inline, sem flash de CSS, com aviso e "Tentar de novo" após 8 s.
