# Visualizador 2.0

Reformulação completa do app `/apps/visualizador/`. Só o Visualizador foi alterado: o Launcher, a logo animada, os outros aplicativos e seus layouts ficaram como estavam. O Coding 1.0 não foi tocado.

## Estrutura da tela

- **Computador (≥ 1100 px):** biblioteca à esquerda, mídia no centro, propriedades à direita, barra própria do formato embaixo. Os painéis têm largura ajustável (arrastar, duplo clique para restaurar, setas no teclado) e podem ser recolhidos.
- **Notebook/tablet (≥ 700 px):** a biblioteca fica fixa; as propriedades abrem em gaveta.
- **Celular:** biblioteca e propriedades são gavetas com cortina; ações secundárias ficam no botão “Mais” (⋯). Testado em 320 e 390 px.
- **Visualização limpa (C)** e **tela cheia (F)**: só a mídia e uma pílula flutuante com anterior/próximo/apresentação e sair. Sem suporte a tela cheia real, cai na visualização limpa.

## Biblioteca

Miniaturas reais (geradas só quando aparecem na tela, duas por vez), grade ou lista, pesquisa sem acento/maiúsculas, filtros por tipo, ordenação (pt-BR), seleção em lote (baixar/remover), arrastar e soltar, Ctrl+V, renomear e remover. Até 100 arquivos por projeto. Preferências do app ficam em `coding-v2-viewer-prefs` (localStorage).

## Por formato

| Formato | Recursos |
|---|---|
| Imagem/SVG | zoom (roda com Ctrl, pinça, botões), ajustar/100%, girar, espelhar, fundo (xadrez/claro/escuro), copiar, apresentação, imprimir |
| Vídeo | player próprio: reproduzir, ±10 s, volume, velocidade, repetir, captura de quadro (PNG), tela cheia |
| Áudio | player próprio com capa (da própria mídia), lista de reprodução e avanço automático |
| PDF | miniaturas, zoom (largura/página/livre), girar, pesquisa com destaque, abrir no Editor PDF |
| 3D (STL/OBJ/GLB) | arrastar/pinça/roda, ângulos prontos, auto-giro, aramado/cor, captura |
| Texto/código | números de linha, quebra, zoom da letra, pesquisa, copiar, formatar JSON (só na tela), abrir no Código |
| Desconhecido | primeiros bytes em hexadecimal e baixar o original |

## Menus de contexto

Cada região tem o seu: mídia (conjunto diferente por formato + Navegação/Exibição/Arquivo), arquivo da biblioteca (abrir, selecionar, renomear, baixar, abrir em outro app, remover; em lote quando há seleção) e fundo da biblioteca (abrir arquivos/link, colar, grade/lista, ordenar, selecionar, limpar filtros). Abrem com botão direito, **Shift+F10** / tecla de menu e **toque prolongado** (520 ms) no celular, onde aparecem como folha inferior. Navegação por setas, digitação e Esc.

## Mídia por link

Detalhes em `MIDIAS-POR-LINK.md` (a lógica de PR #31 foi reaproveitada: `src/shared/media-links.ts`). O formulário agora fica na biblioteca (botão de corrente). Links indicam que dependem de internet, e quando o servidor bloqueia a mídia o app diz isso e oferece abrir o endereço. Páginas (YouTube etc.) são recusadas; não há contorno de DRM ou login.

## Correções reais

- **Desfazer a remoção recupera o arquivo.** Antes, remover e salvar apagava os dados binários e o “desfazer” trazia um item sem conteúdo. Agora os dados continuam na memória (limite de 192 MB para removidos) e são regravados no próximo salvamento. Trocar de arquivo ativo não vira passo de desfazer.
- Impressão do PDF e leitura das páginas sem proxy reativo no documento do pdf.js.
- Shift+F10 abre o menu do Visualizador (a infraestrutura compartilhada interceptava a tecla).
- Recursos de mídia (URLs de blob, players, cena 3D, PDF) são liberados ao trocar de arquivo e ao sair.

## Compatibilidade e dados

O formato salvo no projeto não mudou (`name`, `files`, `activeId`, blobs); projetos da 1.x abrem normalmente. Impressão nativa continua pelo padrão compartilhado: cada formato monta as próprias páginas (`printReason` / `printPages`).

## Alteração compartilhada

Único arquivo compartilhado modificado: `src/shared/contextMenu.ts` — foram removidos os campos `tab:` das ações do Visualizador no menu de ações do app (as abas deixaram de existir). Rótulos, seletores e atalhos continuam iguais.

## Testes

Unitários: `src/apps/viewer/*.test.ts`. E2E: `e2e/visualizador.spec.ts`, `visualizador-midia.spec.ts`, `visualizador-biblioteca.spec.ts`, `visualizador-menus.spec.ts`, `visualizador-layout.spec.ts`, `impressao.spec.ts` (bloco Visualizador) e `responsive-all.spec.ts`. Capturas: `estado-visualizador-*` em `shots/routes.ts`.

## Atalhos

F tela cheia · I propriedades · B biblioteca · C limpar · Ctrl+O abrir · Delete remover · Alt+←/→ navegar · Shift+F10 menu · Ctrl+F pesquisar (PDF/texto) · espaço/K, J/L, M, R, `<`/`>` no vídeo e áudio.
