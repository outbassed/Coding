# Coding

Editor de etiquetas A4 para identificar caixas e produtos, com **vários códigos e descrições**, paginação automática e instalação como aplicativo (PWA).

## Como usar
1. Ao abrir, a **tela inicial** oferece **Continuar editando** (o último documento) e **Criar um novo** (começa com um modelo pronto). Criar um novo nunca apaga os anteriores: eles ficam em **Outros documentos**.
2. Na aba **Itens**, ajuste ou adicione quantos produtos precisar. Cada item tem código, descrição (várias linhas) e número de cópias.
3. Para muitos produtos de uma vez, use **Colar lista**: uma linha por item, no formato `código ; descrição ; cópias`. Também funciona colando direto do Excel/Planilhas.
4. Na aba **Formato**, ajuste fonte, tamanho (8–96 pt), negrito, itálico e alinhamento do código e da descrição, e o texto antes do código (padrão `COD: `).
5. Na aba **Página**, escolha **retrato ou paisagem**, 1 a 3 colunas por folha, o espaço entre etiquetas e a linha de corte tracejada.
6. Clique em **Imprimir / PDF**. Para gerar um PDF, escolha *Salvar como PDF* na janela de impressão.

**Modelo padrão de um documento novo:** `COD: 123`, `Sua descrição aqui`, 3 cópias, espaço de 1 mm entre etiquetas, linha de corte ativa, folha em retrato.

Cada etiqueta (código + descrição) é indivisível: se não couber no fim de uma folha, vai inteira para a próxima. Se uma única etiqueta for maior que a área útil da folha, o app avisa e bloqueia a impressão até você ajustar o texto.

## Recursos
- Tela inicial com **Continuar editando** / **Criar um novo** e biblioteca de até 30 documentos salvos no aparelho
- Vários itens, com cópias de 1 a 500 por item (até 200 itens e 2000 etiquetas por documento)
- Reordenar, duplicar e excluir itens; importar lista colada
- Folha **retrato ou paisagem**, com 1 a 3 colunas e linha de corte opcional
- Zoom que abre mostrando a **página inteira** (clique na porcentagem para alternar com "ajustar à largura"); o editor pode ser ocultado na barra inferior
- Layout responsivo: painel lateral no computador, painel inferior recolhível no celular e no tablet, e lado a lado com o celular deitado
- PWA instalável, com funcionamento offline
- Salvamento automático e exportação/importação de projetos `.coding.json` (abrir um arquivo cria um novo documento, sem sobrescrever)
- Abre automaticamente os documentos de versões anteriores
- HTML, CSS e JavaScript puros, sem frameworks, backend ou contas

## Instalar como aplicativo
- **Android/Chrome e computador (Chrome/Edge):** use o botão **Instalar** do app ou o ícone de instalação da barra de endereço.
- **iPhone/iPad (Safari):** toque em Compartilhar e depois em *Adicionar à Tela de Início*.

A instalação exige HTTPS (o GitHub Pages já oferece) ou `localhost`.

## Arquivos
- `index.html`: estrutura do editor
- `style.css`: layout responsivo e CSS de impressão A4
- `script.js`: itens, paginação, prévia, persistência e instalação
- `manifest.webmanifest`: dados do aplicativo instalável
- `sw.js`: service worker (cache offline)
- `icons/`: ícones do aplicativo

## Observações
- Os documentos ficam salvos apenas neste navegador/dispositivo (limpar os dados do navegador apaga tudo). Use **Salvar** para baixar um backup `.json`.
- Para o tamanho fiel ao imprimir: A4, escala 100%, margens nenhuma e sem cabeçalhos/rodapés.
- As fontes disponíveis variam conforme o sistema operacional.
- O app busca a versão mais nova quando há internet e usa o cache apenas offline. Se criar arquivos novos, inclua-os em `ASSETS` no `sw.js`.
