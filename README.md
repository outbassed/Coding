# Coding

App de documentos para o dia a dia, com dois modos:

- **Coding Etiquetas**: editor de etiquetas A4 para identificar caixas e produtos, com **vários códigos e descrições**, paginação automática e impressão/PDF.
- **Coding Textos**: editor de texto básico, como um Word enxuto, com formatação essencial e **imagens** dentro da folha.

Funciona como site e como aplicativo instalável (PWA), inclusive offline. Sem frameworks, backend ou contas.

## Como usar
1. Abra `index.html` por um servidor (ou publique no GitHub Pages) e, se quiser, instale como aplicativo.
2. Na tela inicial escolha **Etiquetas** ou **Coding Textos**, ou continue o último documento. A biblioteca guarda os dois tipos juntos.
3. Clique em **Imprimir / PDF** (ou Ctrl+P). Para gerar um PDF, escolha *Salvar como PDF* na janela de impressão, em A4, escala 100% e sem cabeçalhos/rodapés.

### Etiquetas
- Aba **Itens**: cada item tem código, descrição (várias linhas) e cópias (1 a 500). **Colar lista** aceita `código ; descrição ; cópias`, inclusive colando do Excel/Planilhas.
- Aba **Formato**: fonte, tamanho (8–96 pt), negrito, itálico, alinhamento e o texto antes do código (padrão `COD: `).
- Aba **Página**: retrato ou paisagem, 1 a 3 colunas, espaço entre etiquetas e linha de corte tracejada.
- Cada etiqueta é indivisível: se não couber no fim da folha, vai inteira para a próxima. Etiquetas maiores que a área útil bloqueiam a impressão até o texto ser ajustado.
- Limites: 200 itens e 2000 etiquetas por documento.

### Coding Textos
- Folha A4 em retrato ou paisagem, com margens de 20 mm (cima/baixo) e 18 mm (laterais).
- Negrito, itálico, sublinhado, fonte, tamanho, cor, alinhamento (esquerda, centro, direita, justificado), títulos 1 e 2, listas com marcadores e numeradas.
- Desfazer/refazer (Ctrl+Z / Ctrl+Y), Ctrl+B / I / U. Colar traz só o texto, sem formatação estranha.
- Contador de palavras e de páginas na barra inferior. A folha é contínua ao editar, com uma linha pontilhada onde cada página A4 termina; o número de páginas é uma estimativa e pode diferir em uma página do PDF em casos de borda (imagem que pula de página, por exemplo).
- **Imagens**: botão *Imagem* (arquivo, galeria ou câmera), Ctrl+V ou arrastar para a folha. Ao selecionar, aparecem alças para redimensionar mantendo a proporção e uma barra com largura (% da folha), alinhamento, **Substituir** (mesmo quadro, sem distorcer; também em imagens indisponíveis, arrastando outra imagem por cima ou colando com a imagem selecionada) e **Remover**.
- As imagens são reduzidas ao inserir (lado maior de até 1600 px, WebP/JPEG). Limite: 30 imagens por documento.
- Se uma imagem não puder ser exibida, aparece um quadro "Imagem indisponível" com o mesmo tamanho e alinhamento. No PDF ele sai vazio, só com uma borda fina, e o app pede confirmação antes de imprimir.

## Favoritos e histórico
Na tela inicial, **Favoritos** lista os documentos marcados com a estrela (também dá para marcar o documento aberto pelo menu: "Adicionar aos favoritos"). O **Histórico** mostra os que não são favoritos. As duas listas são separadas em abas, **Etiquetas** e **Textos**. Na tela inicial aparecem 3 favoritos e 5 documentos do histórico por aba; o botão **Ver mais** abre um popup com a lista completa (rolagem só dentro do popup).

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
- `#/novo/texts`: novo documento do Texts
- `#/continuar`: abre o último documento
- `#/ferramentas`: página com todos os programas; `#/ferramentas/codigos`, `/planilha`, `/pdf` e `/imagens` abrem o documento mais recente da ferramenta
- `#/qr/ID`, `#/planilha/ID`, `#/pdf/ID` e `#/imagens/ID`: abrem um documento salvo daquela ferramenta (também aceitam o nome); `#/novo/qr`, `#/novo/planilha`, `#/novo/pdf` e `#/novo/imagens` criam um novo
- `#/label/ID` (etiquetas) e `#/texts/ID` (textos), também aceitam o nome do documento; `#/doc/ID` continua funcionando
- O botão **Link** copia um endereço que cria uma cópia do documento em quem abrir. **O link não leva imagens** (elas aparecem como "Imagem indisponível"); para levar as imagens, use **Salvar (.json)**.

## Armazenamento
A biblioteca fica no **IndexedDB** do navegador (até 30 documentos), o que permite guardar imagens. Documentos salvos nas versões anteriores (`localStorage`) são migrados sozinhos. Se o navegador não oferecer IndexedDB, o app usa `localStorage` e desativa as imagens. **Salvar** baixa um `.coding.json` (com as imagens, no caso do Texts); **Abrir** importa como um documento novo e abre também arquivos de versões antigas.

## Instalar como aplicativo
- **Android/Chrome e computador (Chrome/Edge):** use o botão **Instalar** do app ou o ícone de instalação da barra de endereço.
- **iPhone/iPad (Safari):** toque em Compartilhar e depois em *Adicionar à Tela de Início*.

A instalação exige HTTPS (o GitHub Pages já oferece) ou `localhost`.

## Arquivos
- `index.html`: estrutura, tela de carregamento (HTML/CSS inline) e telas dos dois modos
- `style.css`: layout responsivo e CSS de impressão A4
- `core.js`: armazenamento (IndexedDB), biblioteca, rotas, tela inicial, exportar/importar/compartilhar, PWA
- `labels.js`: modo Etiquetas (itens, paginação, prévia)
- `texts.js`: modo Textos (editor, sanitização, histórico, imagens)
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
