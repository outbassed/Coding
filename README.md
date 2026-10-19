# Coding

App de documentos e ferramentas para o dia a dia, que funciona offline. Principais programas:

- **Etiquetas**: editor de etiquetas A4 para identificar caixas e produtos, com **vários códigos e descrições**, paginação automática e impressão/PDF.
- **Texto**: editor de texto básico, como um Word enxuto, com formatação essencial e **imagens** dentro da folha.
- **Planilhas**: tabelas com fórmulas, como um Excel simples.
- **Imagens**: editor divertido, estilo Paint + edição de fotos.
- **Sorteio** e **Racha-conta**: roleta, dado, moeda, times e divisão da conta.
- Ainda: QR e código de barras, Planilha → Etiquetas (arquivo, planilha do Coding ou **digitando à mão** numa tabela editável) e Editor de PDF.
- **Relógio**: Brasília por padrão (ou a última região escolhida); a opção **Horário do aparelho (local)** funciona offline. Sem conferir com a internet, a hora aparece com "≈".
- Todos os ícones de controle são SVG; só os adesivos de Imagens continuam emoji.

Funciona como site e como aplicativo instalável (PWA), inclusive offline. Sem frameworks, backend ou contas.

## Como usar
1. Abra `index.html` por um servidor (ou publique no GitHub Pages) e, se quiser, instale como aplicativo.
2. Na tela inicial escolha um programa em **Iniciar um novo documento** ou abra um dos **Documentos recentes** (grade ou lista, busca, filtro por tipo e favoritos). A biblioteca guarda todos os tipos juntos.
3. Clique em **Imprimir / PDF** (ou Ctrl+P). Para gerar um PDF, escolha *Salvar como PDF* na janela de impressão, em A4, escala 100% e sem cabeçalhos/rodapés.

### Etiquetas
- Aba **Itens**: cada item tem código, descrição (várias linhas) e cópias (1 a 500). **Colar lista** aceita `código ; descrição ; cópias`, inclusive colando do Excel/Planilhas.
- Aba **Formato**: fonte, tamanho (8–96 pt), negrito, itálico, alinhamento e o texto antes do código (padrão `COD: `).
- Aba **Página**: retrato ou paisagem, 1 a 3 colunas, espaço entre etiquetas e linha de corte tracejada.
- Cada etiqueta é indivisível: se não couber no fim da folha, vai inteira para a próxima. Etiquetas maiores que a área útil bloqueiam a impressão até o texto ser ajustado.
- Limites: 200 itens e 2000 etiquetas por documento.

### Planilhas
- Grade com colunas A–AZ e até 500 linhas, edição por célula (F2, duplo clique ou só digitar), setas, Tab/Enter, Ctrl+setas, seleção por arraste/Shift, linhas e colunas inteiras e redimensionamento de colunas.
- **Fórmulas** em português (ou inglês): `=SOMA(A1:A5)`, `MÉDIA`, `MÁXIMO`, `MÍNIMO`, `SE`, `SEERRO`, `E`, `OU`, `SOMASE`, `CONT.SE`, `PROCV`, `ARRED`, `CONCATENAR`, `ESQUERDA`, `MAIÚSCULA`, `HOJE` e outras, além de `+ - * / ^ & %` e comparações. Separe argumentos com `;` (com `;` a vírgula vira decimal). Erros: `#DIV/0!`, `#NOME?`, `#VALOR!`, `#REF!`, `#CICLO!`.
- Ao digitar uma fórmula, clicar em outra célula insere a referência. Copiar/colar e Ctrl+D/Ctrl+R ajustam as referências; inserir e excluir linhas e colunas atualizam as fórmulas.
- Negrito, itálico, sublinhado, alinhamento, cor de fundo e do texto, formato de número (Geral, Número, Moeda R$, Porcentagem), AutoSoma (Alt+=), ordenar, desfazer/refazer (Ctrl+Z/Y).
- **Importar** `.xlsx`, `.csv` ou `.tsv` (abre como novo documento) e **baixar** como `.xlsx` (com fórmulas e formatação) ou `.csv`. Imprimir pelo Ctrl+P. Limites: 500 linhas, 52 colunas, 20 000 células preenchidas.

- **Sem digitar fórmulas**: botão **Σ** (Somar, Média, Maior, Menor, Contar) e **Funções** (ajudante: escolha a função, clique nas células e veja o resultado antes de colocar). Ao digitar `=`, aparecem sugestões de funções (Tab aceita).
- **Cores** estilo Google Planilhas: grade pronta, linha padrão, cores personalizadas (+ e conta-gotas) e **Redefinir**; a cor muda ao vivo enquanto você arrasta no seletor.
- **Modelos prontos**: Lista de compras, Controle de gastos, Placar, Dividir a conta, Notas da turma e Estoque.

### Imagens
- Abra uma foto (ou Câmera, Ctrl+V, arrastar) ou comece em **branco**. Fotos muito grandes são reduzidas para 2560 px (1800 px no celular) para o editor ficar rápido.
- **Desenhar**: lápis, pincel, marca-texto, spray, borracha (apaga até ficar transparente), balde, conta-gotas, linha, seta, retângulo, círculo, borrar e pixelar uma área.
- **Textos e adesivos** movíveis (arraste, gire, aumente): texto com fontes e contorno, **Meme**, balão de fala, emojis e uma foto por cima.
- **Cortar** com proporções, girar, espelhar, mudar tamanho, brilho/contraste/cores/calor, 11 filtros (+ *Surpreenda-me*), molduras (borda, polaroid, cantos redondos, círculo, vinheta) e colagem.
- **Salvar**: JPG, PNG ou WebP com qualidade e tamanho, copiar, compartilhar e **figurinha de WhatsApp** (512×512 WebP). Desfazer/refazer (Ctrl+Z/Y) e botão **Original** (segure) para comparar. O que você fez fica salvo no aparelho.

### Sorteio e Racha-conta
- **Sorteio**: roleta de nomes (opção de tirar quem já saiu), sorteio de times, dado (1 a 6 dados de 4 a 100 lados), moeda e número (com ou sem repetir). Usa números aleatórios do navegador (`crypto`).
- **Racha-conta**: divide igualmente (total, pessoas, gorjeta, arredondar) ou **por itens** (quem comeu o quê) e copia um resumo para o grupo.

### Texto
- Folha A4 em retrato ou paisagem, com margens de 20 mm (cima/baixo) e 18 mm (laterais).
- Negrito, itálico, sublinhado, fonte, tamanho, cor, alinhamento (esquerda, centro, direita, justificado), títulos 1 e 2, listas com marcadores e numeradas.
- Desfazer/refazer (Ctrl+Z / Ctrl+Y), Ctrl+B / I / U. Colar traz só o texto, sem formatação estranha.
- Contador de palavras e de páginas na barra inferior. A folha é contínua ao editar, com uma linha pontilhada onde cada página A4 termina; o número de páginas é uma estimativa e pode diferir em uma página do PDF em casos de borda (imagem que pula de página, por exemplo).
- **Imagens**: botão *Imagem* (arquivo, galeria ou câmera), Ctrl+V ou arrastar para a folha. Ao selecionar, aparecem alças para redimensionar mantendo a proporção e uma barra com largura (% da folha), alinhamento, **Substituir** (mesmo quadro, sem distorcer; também em imagens indisponíveis, arrastando outra imagem por cima ou colando com a imagem selecionada) e **Remover**.
- As imagens são reduzidas ao inserir (lado maior de até 1600 px, WebP/JPEG). Limite: 30 imagens por documento.
- Se uma imagem não puder ser exibida, aparece um quadro "Imagem indisponível" com o mesmo tamanho e alinhamento. No PDF ele sai vazio, só com uma borda fina, e o app pede confirmação antes de imprimir.

## Favoritos e histórico
Na tela inicial, os **Documentos recentes** aparecem como miniaturas (ou em lista), com busca pelo nome ou conteúdo, filtro por tipo (inclui **Favoritos**), ordem por data ou de A a Z e a estrela para favoritar (também dá para favoritar o documento aberto pelo menu).

## Barra superior no celular
Em telas pequenas a barra mostra só o logo (volta à tela inicial), o nome do documento (toque para renomear) e o botão de três risquinhos, que abre o menu com Tela inicial, Novo documento, Imprimir / PDF, Copiar link, Salvar, Abrir arquivo e Atalhos (e Instalar, quando disponível).

## Menu de clique direito e atalhos
O botão direito abre o menu do Coding, que muda conforme o lugar (item de etiqueta, folha, texto, imagem, qualquer lugar) e mostra os atalhos de cada opção. **Shift + botão direito** abre o menu do navegador, que também continua nos campos de digitação das Etiquetas. No celular, use o toque longo. Pelo teclado: tecla Menu ou Shift+F10, setas, Enter e Esc.

| Atalho | Ação |
| --- | --- |
| Ctrl+P | Imprimir / PDF |
| Ctrl+S | Salvar projeto (.json) |
| Alt+N | Novo documento do mesmo tipo |
| Alt+H | Tela inicial |
| ? | Lista de atalhos |

Ctrl+N e Ctrl+T pertencem ao navegador e não podem ser usados. "Colar" pelo menu precisa da permissão do navegador para ler a área de transferência; sem ela, use Ctrl+V.

## Links
- `#/novo` ou `#/novo/etiquetas`: novo documento de Etiquetas
- `#/novo/texts`: novo documento de Texto
- `#/novo/planilhas` e `#/planilhas/ID`: Planilhas
- `#/continuar`: abre o último documento
- `#/ferramentas`: página com todos os programas; `#/ferramentas/codigos`, `/planilha`, `/pdf` e `/imagens` abrem o documento mais recente da ferramenta
- `#/qr/ID`, `#/planilha/ID`, `#/pdf/ID` e `#/imagens/ID`: abrem um documento salvo daquela ferramenta (também aceitam o nome); `#/novo/qr`, `#/novo/planilha`, `#/novo/pdf` e `#/novo/imagens` criam um novo
- `#/etiquetas/ID`, `#/texto/ID`, `#/planilhas/ID`, `#/sorteio/ID`, `#/racha/ID`: documentos salvos (os antigos `#/label/ID` e `#/texts/ID` e `#/doc/ID` continuam abrindo); `#/novo/sorteio` e `#/novo/racha` criam um novo
- O botão **Link** copia um endereço que cria uma cópia do documento em quem abrir. **O link não leva imagens** (elas aparecem como "Imagem indisponível"); para levar as imagens, use **Salvar (.json)**.

## Armazenamento
A biblioteca fica no **IndexedDB** do navegador (até **30 documentos**, contador "X/30" na tela inicial), o que permite guardar imagens. Documentos salvos nas versões anteriores (`localStorage`) são migrados sozinhos. Se o navegador não oferecer IndexedDB, o app usa `localStorage` e desativa as imagens.
- **Rascunhos:** um documento **novo e vazio** fica só na memória: se você sair sem mexer, ele some e não ocupa um dos 30 lugares. Ele entra na biblioteca na primeira alteração real (digitar, importar uma foto/arquivo, renomear, favoritar). Trocar de aba, painel ou zoom não conta como edição.
- **Abrir sem editar** não regrava o documento nem muda a data de "alterado".
- **Limite de 30:** ao salvar o 31º documento real, o mais antigo (pela última edição) que **não** seja favorito é apagado, com aviso. Favoritos (estrela) nunca são apagados sozinhos; se os 30 forem favoritos, o novo não é salvo e o app explica como liberar espaço.
- **Salvar com segurança:** as gravações entram numa fila; se faltar espaço, o status mostra "Não foi possível salvar" e a alteração continua pendente (nada é dado como salvo sem estar).
- **Salvar (.json)** baixa um `.coding.json` (com as imagens, no caso de Imagens); **Abrir** importa como documento novo. Formatos aceitos: versões 1 a 3 (documentos antigos) e **4** (Imagens, Sorteio e Racha-conta).

## Instalar como aplicativo
- **Android/Chrome e computador (Chrome/Edge):** use o botão **Instalar** do app ou o ícone de instalação da barra de endereço.
- **iPhone/iPad (Safari):** toque em Compartilhar e depois em *Adicionar à Tela de Início*.

A instalação exige HTTPS (o GitHub Pages já oferece) ou `localhost`.

## Arquivos
- `index.html`: estrutura, tela de carregamento (HTML/CSS inline) e telas dos dois modos
- `style.css`: layout responsivo e CSS de impressão A4
- `core.js`: armazenamento (IndexedDB), biblioteca, rotas, tela inicial, exportar/importar/compartilhar, PWA
- `labels.js`: modo Etiquetas (itens, paginação, prévia)
- `texts.js`: modo Texto (editor, sanitização, histórico, imagens)
- `calc-engine.js`: motor de fórmulas das Planilhas (sem dependências)
- `tool-calc.js`: modo Planilhas (grade, edição, formatação, CSV/xlsx)
- `tool-images.js`: editor de Imagens; `tool-fun.js`: Sorteio e Racha-conta; `tool-pdf.js`: Editor de PDF
- `exemplos/`: foto de exemplo da ferramenta Imagens (créditos na própria tela)
- `menu.js`: menu de clique direito e atalhos
- `manifest.webmanifest`: dados do aplicativo instalável
- `sw.js`: service worker (cache offline)
- `icons/`: ícones do aplicativo

## Observações
- Os projetos ficam salvos apenas neste navegador/dispositivo. Use **Salvar** para baixar um backup `.json`.
- Textos e HTML vindos de links ou arquivos `.json` são filtrados (só marcações de formatação conhecidas; sem scripts, links ou estilos arbitrários).
- As fontes disponíveis variam conforme o sistema operacional.
- **Ao alterar qualquer arquivo do app**, aumente `CACHE_VERSION` em `sw.js` e inclua novos arquivos em `ASSETS`, senão quem já instalou continua vendo a versão em cache.

## Licenças de terceiros
`vendor/qrcode.js` é o *qrcode-generator* de Kazuhiko Arase (MIT, `vendor/qrcode.LICENSE`), `vendor/pdf-lib.min.js` de Andrew Dillon (MIT, `vendor/pdf-lib.LICENSE`) e `vendor/pdf.min.js` / `pdf.worker.min.js` do pdf.js da Mozilla (Apache 2.0, `vendor/pdfjs.LICENSE`).
