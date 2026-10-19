# Roadmap do Coding

Lista de pedidos pendentes. Quando o dono do projeto mandar **"Iniciar update"**, o Claude implementa tudo o que está em **Próximo update**, testa, atualiza o README e envia para a `main`. Depois move os itens concluídos para **Feito**.

## Próximo update

### Auditoria de 18/10 (v23) — plano em fases, aguardando "Iniciar update"
Conferido no código: P0-01 (backups v4 de Imagens/Sorteio/Racha-conta são recusados ao abrir; só 1–3 são aceitos), P1-06 (`vendor/pdf*.js` e `pdf-lib` não estão no pré-cache), P1-09 (`slice(0, 30)` na inicialização), P0-04 ("Cobrir" do PDF só põe um retângulo branco), P1-08 (documento novo é gravado antes de qualquer edição). Os demais itens (filtros que empilham, troca de foto sem aviso, XLSX com linhas vazias, centavos do Racha-conta) ainda serão reproduzidos no navegador antes de corrigir.
- **Fase 1 – Confiabilidade (FEITA e na `main`):** formato `.coding.json` central e aceitando v4; rascunho que só entra na biblioteca após edição real; abrir sem editar não regrava nem muda a data; gravações em fila; indicador de status; limite de 30 (apaga o mais antigo não favorito, favoritos protegidos, contador X/30); aviso ao trocar/substituir foto.
- **Fase 2 – Lógica (FEITA e na `main`):** filtros não destrutivos (Normal, intensidade, trocar em vez de empilhar); linhas do XLSX pela posição real; Racha-conta em centavos inteiros e `1.234,56`; "Cobrir visualmente" com aviso claro.
- **Fase 3 – UX (FEITA, publicando; só falta teste em celular na Fase 4):** ícones 100% SVG nos controles (sem emoji, exceto adesivos do usuário); editor manual de Planilha → Etiquetas; horário local do aparelho.
- **Fase 4 – Offline/responsivo (FEITA e na `main`; falta só teste em celular físico):** pré-cache do PDF, testes em 320–1920 px, acessibilidade.
- **Fase 5 – Documentação e relatório PASSOU/FALHOU (FEITA):** ver `RELATORIO-TESTES.md`.
- Regras do dono: trabalhar em branch, commits pequenos, nada de extras (P3) sem aprovação.

### Auditoria completa (documento do dono, 18/10) — plano em fases
Conferido no código: **P0-01** (importar `.coding.json` v4 de Imagens/Sorteio/Racha é recusado), **P1-06** (`vendor/pdf*.js` e `pdf-lib` fora do pré-cache), **P1-07** (`1.234` vira 1,234; centavos em ponto flutuante), **P1-05** (xlsx ignora o número da linha), **P0-04** ("Cobrir" só pinta de branco), **P1-08/09** (documento novo é gravado antes de editar; `slice(0,30)` na abertura).
- **Fase 1, confiabilidade:** aceitar v4 e testar exportar→importar dos 9 tipos; rascunho em memória (só vai para Recentes após mudança real; abrir sem editar não regrava nem muda a data); gravação em fila; limite de 30 com favoritos protegidos e contador X/30 (pedido anterior); confirmação certa ao trocar foto/tela em branco.
- **Fase 2, lógica:** filtros de Imagens não destrutivos (Normal, intensidade 0–100%, um filtro por vez, preservado ao reabrir); xlsx respeitando `row r=`; Racha-conta em centavos e valores em pt-BR; "Cobrir visualmente" com aviso claro.
- **Fase 3, visual:** todos os ícones de controle em SVG (emoji só como conteúdo do usuário: adesivos); Planilha→Etiquetas com campos visuais (código, descrição, cópias).
- **Fase 4:** responsividade (320–1920 px), pré-cache offline do PDF, `manifest` atualizado, acessibilidade.
- **Fase 5:** regressão com relatório PASSOU/FALHOU, README/ROADMAP, publicar. **Fase 6 (P3):** só com aprovação.
- Horário local do aparelho (pedido anterior) entra junto.

### Limite automático de documentos (pedido de 18/10)
- Ao passar de 30 documentos, o Coding apaga sozinho o mais antigo que **não** seja favorito. Favoritos nunca são apagados automaticamente, só à mão. Se os 30 forem favoritos, avisa e não cria o novo até liberar espaço.
- Avisar com um toast ("Apaguei «nome» (o mais antigo) para abrir espaço") e deixar claro no README e na tela inicial que favoritar protege o documento.

### Horário local no relógio (pedido de 18/10)
- Acrescentar na lista de regiões a opção **"Horário do aparelho (local)"**, que usa o fuso do próprio aparelho e funciona offline.
- Padrão: online usa **Brasília** ou a **última região escolhida** (já salva); a opção local fica sempre disponível, inclusive sem internet.

## Ideias ainda não aprovadas
- Salvar modelos próprios (por exemplo "meu padrão" com fontes e tamanhos).
- Duplicar documento na tela inicial.
- Tamanhos de etiqueta fixos (por exemplo 10 × 5 cm).
- Contador "faltam X etiquetas" para completar a última folha.
- Ainda não feitos da pesquisa de ferramentas: Scanner/OCR (tesseract.js), Câmbio (Frankfurter), CEP/CNPJ/feriados (BrasilAPI), comprimir PDF, juntar fotos em PDF, cartão/convite. Precisam de internet para as APIs; a testar fora do ambiente de desenvolvimento.
- QR com formulários prontos, Etiquetas com tamanhos prontos, Texto com tabelas/cabeçalho/.docx, modelos, pastas e backup geral.

## Feito
- **v23 (18/10)** Planilhas: paleta de cores estilo Google (Redefinir, grade pronta, cores personalizadas, conta-gotas) que muda ao vivo; Σ com Somar/Média/Maior/Menor/Contar; **Ajudante de funções** (escolher a função, clicar nas células, ver o resultado antes de colocar); sugestões ao digitar `=`; modelos prontos (Lista de compras, Controle de gastos, Placar, Dividir a conta, Notas, Estoque).
- **v23** Imagens reescrito como editor casual (Paint + foto): lápis, pincel, marca-texto, spray, borracha, balde, conta-gotas, formas, texto, meme, balão, adesivos, foto por cima, borrar/pixelar, cortar com proporções, girar/espelhar/redimensionar, brilho/contraste/cores/calor, 11 filtros, molduras, colagem, figurinha de WhatsApp, desfazer/refazer, comparar com o original, JPG/PNG/WebP com qualidade e tamanho. Fotos grandes são reduzidas automaticamente (sem travar).
- **v23** Novas ferramentas **Sorteio** (roleta de nomes, times, dado, moeda, número) e **Racha-conta** (dividir igual ou por itens, com gorjeta e resumo para copiar).
- **v22** Links em português (`#/etiquetas/`, `#/texto/`, os antigos continuam abrindo), hora oficial de Brasília (ou outra região) via cabeçalho `Date` do servidor, seleção em lote na tela inicial e balão ⓘ com os detalhes dos documentos.
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
