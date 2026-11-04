# Contrato de edição direta (DIR-04)

Como os aplicativos do Coding deixam a pessoa **editar na própria folha, cena, tela ou prévia**, sem depender do painel lateral. É o contrato reutilizável; o **Etiquetas** é a primeira aplicação (código e descrição direto na etiqueta). Outros aplicativos só adotam o contrato depois de uma decisão do dono, caso a caso (ver `DIR-02` e `DIR-03` em [PLANEJAMENTO-FUTURO.md](./PLANEJAMENTO-FUTURO.md)).

Código compartilhado: `src/editors/surface/` (`InlineText.vue` e `text.ts`, com `text.test.ts`).

## 1. Princípios

1. **O modelo do app é a única fonte da verdade.** O campo na superfície mostra o modelo e envia mudanças pelo **mesmo caminho do painel** (`setItem`, `setField` e afins). Isso garante um só histórico, um só salvamento e a mesma normalização.
2. **A superfície é uma projeção.** Painel e superfície escrevem no mesmo modelo, então ficam sincronizados nos dois sentidos, e **todas as repetições** do mesmo elemento (por exemplo, as cópias de um item) mudam juntas.
3. **A edição só existe na tela de edição.** Medição, impressão, exportação e PDF usam o elemento **somente leitura**, com a mesma marcação de antes: nada de `contenteditable`, contorno ou indicação de edição fora da prévia. O **formato salvo não muda** (nenhuma migração).
4. **Sem texto formatado escondido.** Os campos guardam texto puro. Formatação é do modelo (fonte, tamanho, alinhamento), nunca do campo.
5. **Nada se perde sem querer.** Esc devolve o valor de quando o campo foi aberto; o desfazer do app cobre o resto.

## 2. Como a pessoa ativa e encerra a edição

| Ação | Mouse | Teclado | Toque |
| --- | --- | --- | --- |
| Começar | Clique no texto | Tab até o campo e digitar | Toque no texto |
| Confirmar | Clicar fora | Enter (campo de uma linha) · Ctrl/⌘+Enter (várias linhas) · Tab | Tocar fora, tecla de confirmar do teclado ou **Concluir edição** |
| Cancelar | — | Esc (volta ao valor de quando o campo foi aberto) | — |
| Desfazer / refazer | Botões do app | Ctrl/⌘+Z, Ctrl/⌘+Shift+Z ou Ctrl+Y | Menu de desfazer do teclado do sistema |

- **Desfazer e refazer são os do app**, não os do navegador. O atalho é interceptado e o pedido `historyUndo`/`historyRedo` do campo também (teclados de celular).
- Digitar de forma contínua no mesmo campo vira **um** passo de desfazer, igual ao painel (mesma chave de histórico).
- Atalhos do app (salvar, imprimir) continuam funcionando com o foco no campo.
- Negrito, itálico e demais comandos de formatação do navegador são bloqueados. Soltar arquivo ou texto dentro do campo é bloqueado.

## 3. Regras do campo (`InlineText`)

- Campo **de uma linha**: Enter confirma; quebras de linha viram espaço (inclusive ao colar). **De várias linhas**: Enter quebra a linha.
- O texto entregue ao modelo não leva quebras de linha **no fim** (o Chromium acrescenta uma extra para mostrar o cursor) nem espaços sem quebra. Colar insere só o texto simples.
- O limite de caracteres do modelo é aplicado na hora; passou do limite, o campo mostra o que o modelo vai guardar.
- Enquanto o campo tem o foco, **o texto que ele mesmo enviou não é regravado** (o cursor não pula). Mudanças que vêm de fora (painel, desfazer, outra cópia) são regravadas.
- Durante composição de texto (acentos, teclados IME e de celular), nada é enviado até a composição terminar.
- `autocorrect` e `autocapitalize` desligados (códigos não podem ser "corrigidos").

## 4. Foco e leitores de tela

- Cada campo é `role="textbox"` com nome próprio que diz **onde está** (por exemplo, "Código na etiqueta (item 2, cópia 1 de 3)") e `aria-multiline` quando é de várias linhas. Uma descrição curta (`aria-describedby`) explica Enter, Ctrl+Enter, Esc e Ctrl+Z.
- **Repetições:** todas as cópias aceitam clique e toque, mas **só a primeira cópia de cada item entra na ordem do Tab**. Um item com 500 cópias não cria 500 paradas de teclado.
- Campos vazios só aparecem se estiverem em edição (com um texto-guia visível só enquanto o campo tem o foco). Adicionar um campo que não existe ainda continua sendo pelo painel.
- Foco visível sempre (contorno de 0,9 mm na folha), e também ao passar o mouse, para mostrar que o texto é editável.
- `prefers-reduced-motion` desliga a transição do contorno.

## 5. A folha pode ser refeita com o campo dentro

Digitar muda o tamanho das etiquetas e a divisão em folhas. Para o campo não trocar de dono nem perder o foco:

- Cada elemento repetido tem **chave estável** (identificador do item + número da cópia). O campo sempre pertence à mesma cópia.
- Se mesmo assim o campo perder o foco por causa do redesenho (por exemplo, a etiqueta passou para a folha seguinte), o app **devolve o foco e o cursor** à mesma posição, trocando de folha se preciso. Para distinguir isso de uma saída desejada (clique fora, Tab, Esc, Enter, **Concluir edição**), o app marca as saídas desejadas. Há um limite de 4 tentativas por 1,5 s para nunca entrar em ciclo.
- O item continua na folha enquanto o campo está em edição, mesmo que o texto seja apagado por inteiro; se a pessoa sair com ele vazio, ele volta a seguir a regra normal do app (item sem conteúdo não aparece).

## 6. Zoom e transformações

A folha é desenhada em tamanho real (mm) e reduzida/ampliada por `transform: scale()`. O campo editável fica **dentro** dessa folha, então o navegador cuida sozinho do cursor, da seleção e do toque em qualquer zoom: **o app não converte coordenadas**. (Elementos que o app arrasta ou redimensiona, como o texto do Versos, usam as próprias regras e não fazem parte deste contrato.)

## 7. Celular e tablet

- O campo tem pelo menos o tamanho do texto da etiqueta; a rolagem da prévia continua funcionando (toque curto edita, arrastar rola).
- Ao começar a editar, o painel de ferramentas **se recolhe** para dar lugar à folha e ao teclado virtual; a barra de ferramentas permanece para reabri-lo. O campo é rolado até ficar visível depois que o teclado abre.
- **Concluir edição** aparece enquanto há um campo em edição.
- Limite conhecido: o iOS pode ampliar a página ao focar texto menor que 16 px. Não foi validado em aparelho real (`PLT-08`).

## 8. Como um novo aplicativo adota o contrato

1. Mantenha a **versão somente leitura** do elemento (usada na medição, na impressão e na exportação) e uma versão **editável** só na tela de edição; as duas com o mesmo tamanho e a mesma marcação visível.
2. Use `InlineText` para os campos de texto; ligue `update:modelValue` ao método do app que já altera o modelo, com a mesma chave de histórico do painel.
3. Dê **chave estável** aos elementos repetidos e trate `end` com `settled: false` devolvendo o foco (veja `LabelsPreview.vue`).
4. Destaque no painel o item em edição (`active-id` do `ItemsPanel` no Etiquetas).
5. Escreva testes de: clique e digitação, Enter/Esc, desfazer, sincronia com o painel e com as cópias, zoom, toque, impressão sem rastros e documento salvo igual ao do painel.

## 8.1 Adoção no Imagens (canvas) — extensão do contrato para elementos arrastáveis

O Imagens desenha tudo num `<canvas>`; por isso o que muda em relação à folha do Etiquetas é só **como o campo aparece**:

- **Texto no lugar.** Dois cliques (ou dois toques) em um texto, Enter com a área da imagem em foco, ou o botão **Editar texto** abrem um `InlineText` por cima do canvas, com a mesma posição, largura, fonte, tamanho, cor, alinhamento e rotação da camada (o zoom é a mesma escala do canvas). Enquanto o campo existe, o canvas **não desenha** o texto daquela camada (`hideTextOf` em `renderComposition`), para não aparecer duplicado; a exportação nunca passa por esse caminho. Durante a edição o campo é mostrado sem espelhamento.
- **Mesmo modelo, mesma história.** O campo escreve em `layer.text` com a chave de histórico `t<id>`, a mesma do painel Texto e forma: digitar nos dois lugares é um passo só de desfazer. Ctrl+Z/Ctrl+Y vêm do próprio app (`doc.undo()/redo()`).
- **Celular.** Ao iniciar a edição a gaveta se recolhe (`collapseTools()` da casca) e aparece **Concluir edição** na barra do zoom.
- **Alças.** As 4 alças de canto ganharam 4 alças de meio de borda (só largura ou só altura), com área de toque de 44 px. A geometria é pura e testada (`apps/images/direct.ts`).
- **Recorte arrastando.** Dois cliques em uma imagem, Enter ou o botão **Recortar** trocam as alças pelas do recorte; arrastar uma borda mexe em `crop` e na caixa da camada ao mesmo tempo, deixando o conteúdo visível parado. Os campos `crop-*` do painel mostram os mesmos números. Esc ou **Concluir recorte** sai.

## 9. Pendências deste contrato

- Adicionar pela folha um campo que está vazio (hoje só pelo painel).
- Colar várias linhas na descrição já funciona; arrastar para reordenar etiquetas na folha **não faz parte** deste contrato.
- Validar em aparelhos reais (iOS e Android) e em outros navegadores (`PLT-08`). O CI cobre Chromium.
- Campos de outros tipos (números, listas, formas) e elementos arrastáveis precisarão de extensões do contrato antes do Editor SVG (`NEW-03`).
