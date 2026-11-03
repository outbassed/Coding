# Impressão nativa — infraestrutura e auditoria

Prioridade **alta** no [planejamento oficial](./PLANEJAMENTO-FUTURO.md) (item `PRT-01`). Desenvolvido em PR separado.

## Problema

Antes desta mudança, só cinco apps tinham algum tratamento de impressão (Etiquetas, Texto, Planilhas, QR / Barras e Racha-conta), cada um com o seu `@media print` e o seu `window.print()`. Os demais (Imagens, Visualizador, Pintar, Editor PDF, Versos e os outros) não tinham impressão própria: imprimir pelo navegador levava junto a interface do editor, painéis, botões e áreas vazias, ou cortava a composição.

## Regras que valem para todos os apps

1. Usa a janela nativa de impressão do navegador (`window.print()`); nenhum motor próprio de PDF foi trocado.
2. Imprime **somente o conteúdo escolhido**: menus, cabeçalhos, painéis, botões e áreas vazias nunca saem no papel.
3. Respeita orientação, proporção, dimensões, margens e várias páginas.
4. Exportar e Exportar PDF continuam como estavam.
5. Cada app expõe **Arquivo → Imprimir** (`data-testid="print-app"`), o item **Imprimir** do menu de contexto e o atalho **Ctrl+P** (e **Ctrl+P** também aparece na lista de atalhos do app).
6. Se não há o que imprimir, nada é impresso e o app mostra um aviso com o motivo (por exemplo, "Abra um arquivo primeiro"); o botão não abre uma página em branco.

## Infraestrutura compartilhada (`src/shared/print/`)

| Arquivo | Papel |
| --- | --- |
| `print.ts` | Registro do provedor de impressão do app aberto, montagem das páginas, `requestPrint()`, Ctrl+P (fase de captura), `beforeprint`/`afterprint`. |
| `layout.ts` | Cálculo puro das páginas: papel (A5, A4, A3, Carta), orientação automática pela proporção, margem, ajuste (`contain`) e CSS `@page`. Coberto por testes unitários. |
| `pages.ts` | Construtores de página: `canvasPage`, `imagePage`, `textPage`, `pdfPages`. |
| `usePrint.ts` | Composable que registra o provedor do app enquanto ele está montado. |
| `PrintButton.vue` | Botão padrão de Arquivo → Imprimir. |
| `apps.ts` | Lista dos apps imprimíveis (usada pelo menu de contexto e pela lista de atalhos). |

Dois tipos de provedor:

- **`built`** — o app devolve um `PrintJob` (título e páginas). A infraestrutura monta `#coding-print-root` **fora** do `#app`, injeta `@page` nomeado por tamanho/orientação e, durante a impressão, esconde todo o resto (`html[data-print-mode=built]` + `@media print`). Espera `img.decode()` antes de abrir a janela. Fora da impressão a raiz fica oculta e é limpa em `afterprint`.
- **`dom`** — o app já tem uma folha própria que é o próprio conteúdo (Etiquetas, Texto, Planilhas, QR / Barras). Só chama `window.print()` pelo mesmo caminho (menu, Ctrl+P e botão).

Páginas `contain` (imagens/telas) cabem no papel sem distorcer, com folga de segurança de 0,6 mm; páginas `flow` (texto) são paginadas pelo navegador. Impressão pelo menu do navegador (sem passar pelo botão) também é coberta: `beforeprint` monta o conteúdo, ou uma página de aviso quando não há o que imprimir.

## Auditoria por aplicativo

"Antes" é o que o código da base fazia; a coluna "Agora" é o que o PR entrega e que o teste `e2e/impressao.spec.ts` verifica gerando o **PDF real** (`page.pdf`) e analisando com pdf.js (número de páginas, tamanho da página, texto, tinta fora das margens e ausência de elementos da interface).

| App | Antes | Agora | Provedor |
| --- | --- | --- | --- |
| Etiquetas | Imprimia corretamente (folha própria) | Mesmo resultado; Ctrl+P e menu passam pela infraestrutura | dom |
| Texto | Folha própria, correta | Mesmo resultado | dom |
| Planilhas | Folha própria, correta | Mesmo resultado | dom |
| QR / Barras | Folha própria, correta | Mesmo resultado | dom |
| Racha-conta | `@media print` com resumo | Resumo em página própria, sem interface | built |
| Imagens | **Incorreto**: sem impressão própria; saía a interface | Imprime a composição final (camadas, filtros, recorte), orientação pela proporção | built |
| Pintar | **Incorreto**: sem impressão própria | Imprime a composição final sobre fundo branco | built |
| Visualizador | **Incorreto**: sem impressão própria | Por formato: imagem, SVG, PDF (todas as páginas), texto/código, quadro do vídeo, capa do áudio, vista atual do 3D; nunca controles de mídia | built |
| Editor PDF | **Incorreto**: sem impressão própria | Todas as páginas, cada uma no seu tamanho | built |
| Versos | **Incorreto**: sem impressão própria | Imprimir cena atual ou todas as cenas (uma por página) | built |
| Desenho | Sem impressão própria | Imprime o desenho em escala | built |
| Calculadora | Sem impressão própria | Histórico de cálculos | built |
| Estúdio de Cores | Sem impressão própria | Paleta | built |
| Compactador ZIP | Sem impressão própria | Lista do conteúdo | built |
| Comparador | Sem impressão própria | Resultado da comparação | built |
| Código | Sem impressão própria | Código-fonte | built |
| Sorteio | Sem conteúdo imprimível relevante | Mantido fora da lista | — |

## Limites conhecidos

- Os testes imprimem em PDF no **Chromium** (CI); a janela de impressão de Safari/iOS e Firefox não foi validada (ver `PLT-08`).
- Textos acima de 400.000 caracteres são truncados na impressão (aviso no próprio papel), para não travar o navegador.
- Imagens grandes são reduzidas para até 3508 px no maior lado antes de ir para a página (resolução suficiente para A4 em 300 dpi).
- Sem tamanho de papel configurável pelo usuário ainda (A4 por padrão; o navegador pode trocar na janela de impressão).
