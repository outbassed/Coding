# Coding 2.0 · Grande atualização web — notas de entrega

Este documento descreve o que mudou na branch `feature/coding-v2-launcher-fixes-sonnet` (PR #12, rascunho), o que **não** foi feito, os riscos de migração e como verificar. Nada aqui foi publicado: **não houve deploy, merge, nem mudança no Coding 1.0, na `main`, no banco `coding-db` ou na hospedagem**.

## O que há de novo

### Base compartilhada
- **Abas de projeto por app** (5 visíveis, `+N` escondidos, regra de menos recente, restauração do último projeto, seletor no celular) e **limites de projetos salvos por app** (Automático/Manual; faixas abaixo da quantidade salva ficam desativadas com o motivo; nada é apagado para caber no limite).
- **Gravação segura**: “Salvo neste aparelho” só aparece depois da transação do IndexedDB; duas janelas editando o mesmo documento nunca sobrescrevem em silêncio (conflito → “Salvar como nova cópia” ou “Reabrir a versão salva”); cota cheia ou gravação interrompida mostram o erro e mantêm o texto na tela.
- **Instalação offline por app**, com tamanhos e SHA-256 reais lidos do build (experimental, desligada por padrão; ver README).

### Apps novos
| App | O que faz hoje |
| --- | --- |
| **Código** | Projeto com vários arquivos e pastas; explorador (criar, renomear, excluir, arquivo de entrada); abas de arquivo; editor com números de linha, realce HTML/CSS/JS, recuo automático, pares de aspas/parênteses, Ctrl+F e substituir; busca no projeto; visualização em quadro isolado (`sandbox="allow-scripts"`, sem `allow-same-origin`, CSP) com console e navegação entre páginas; imagens e arquivos de texto do projeto resolvem por caminho relativo; importar arquivos, pasta (pelo seletor) e ZIP; exportar ZIP, página única e arquivo. |
| **Visualizador** | Imagens, SVG saneado, vídeo e áudio nativos, 3D (STL/OBJ/GLB), PDF e texto; busca na lista, anterior/próximo, tela cheia, apresentação de imagens, propriedades reais (nome, bytes, tipo detectado, dimensões/duração), Ctrl+V, “Abrir uma cópia no Código” para textos. |
| **Pintar** | Desenho em camadas (adicionar, ordenar, renomear, ocultar, travar), lápis/pincel com dureza e pressão da caneta, borracha, linha, retângulo, elipse, balde (limitado), conta-gotas, texto, seleção (mover, copiar, recortar, colar, apagar), zoom/mover, modo pixel art, exportar PNG/JPG/WebP. |

### Apps existentes
- **Imagens**: Ctrl+V, botão “Colar imagem” e arrastar-e-soltar criam camadas, sem roubar o colar de campos de texto.
- **Planilhas**: cor de fonte e de preenchimento no modelo de dados (célula, intervalo, coluna, linha, tudo), ida e volta em XLSX.
- **Estúdio de Cores**: Ctrl+V/soltar imagem, cor exata clicando na imagem.
- **Texto**: **links** (só `http`, `https` e `mailto`; Ctrl+K; Ctrl+clique abre em outra aba; hiperlink de verdade no DOCX), **espaçamento entre linhas** (1; 1,15; 1,5; 2), painel **Estrutura** com os títulos (clique leva o cursor), correção de seleção atrasada ao usar listas de estilo.
- **Editor PDF**: além de texto, retângulo e destaque, agora **elipse, linha, desenho livre (também serve para assinar) e imagem** (arquivo, Ctrl+V; PNG/JPEG vão direto, outros formatos viram PNG), com cor, espessura, espelhar linha, duplicar, excluir e Delete. O PDF exportado é conferido nos testes **desenhando-o de novo** com o pdf.js e olhando os pixels.
- **QR / Barras**: **assistente de conteúdo** (site, Wi-Fi com escape correto, e-mail, telefone, SMS, contato vCard), **vários códigos de uma vez** (um por linha) e **aparências salvas** (até 12).
- **Sorteio**: **listas salvas** de participantes (até 20) e **conferência do histórico** (clicar num resultado antigo mostra o registro sem sortear de novo).

## Limitações conhecidas (honestas)
- **Código**: sem `import` de módulos ES entre arquivos; sem destaque do par de parênteses; realce desligado acima de 150 mil caracteres; imagens do projeto vão embutidas como `data:` (até 8 MB por arquivo, 40 MB no total); arrastar **pasta** não é suportado (use “Importar pasta” ou ZIP).
- **Pintar**: não há par de cores frente/fundo; a seleção não escala/gira; texto vira pixels depois de confirmado.
- **Visualizador**: “Abrir em…” só existe de texto para o Código (não para Imagens/PDF/Pintar); vídeo/áudio dependem dos codecs do navegador (o aviso é mostrado quando falham); tela cheia depende do navegador.
- **Editor PDF**: as anotações são **sobreposições**; o texto que já existe em um PDF **não** é editado. Não há opacidade por anotação.
- **Texto**: o PDF é gerado por imagem das folhas (para texto selecionável use Imprimir → Salvar como PDF); links não são clicáveis no PDF por imagem.
- **Etiquetas**: não receberam melhorias nesta rodada além do que já existia (a grade de etiquetas não é um canvas livre; guias/ajuste magnético não se aplicam ao modelo atual).
- **Casca**: painel direito de propriedades e modo foco unificados **não** foram implementados; cada app mantém o seu painel.
- **Teste de cota cheia** usa um erro simulado; a mensagem exibida é a de gravação cancelada pelo navegador (“Nada foi alterado; tente de novo.”).
- Safari/iOS e instalação em aparelhos reais **não foram validados**; os testes automáticos rodam em Chromium.

## Migração e compatibilidade
- **Código**: documentos antigos `{html, css, js}` são convertidos para `index.html`, `style.css` e `script.js` ao abrir (abrir não regrava; a primeira edição salva no formato novo).
- **PDF, Texto, QR e Sorteio** ganharam campos novos **opcionais** (`points`/`img`/`stroke`/`flip` nas anotações; `<a>` e `line-height` no HTML do Texto; `stylePresets`; `presets`). Documentos antigos abrem normalmente.
- **Risco de “voltar atrás”**: abrir e salvar um documento criado com os campos novos em um build **anterior** a esta branch descarta esses campos (o saneador antigo não os conhece). Faça backup antes de alternar entre versões.
- O banco `coding-v2-documents` mantém o mesmo esquema; nenhuma migração de versão do IndexedDB foi necessária nesta rodada. O `coding-db` do Coding 1.0 nunca é aberto para escrita.

## Como verificar
```bash
cd coding-v2
npm ci
npm run test:structure && npm run typecheck && npm run test:unit && npm run build
npx playwright install chromium
npm run test:e2e
```
Resultado mais recente conhecido do CI da branch está no corpo do PR (preenchido a partir do GitHub Actions, nunca estimado).

### Onde cada cenário da matriz de testes é coberto
| Cenários | Arquivos |
| --- | --- |
| A–E abas de projeto | `e2e/workspace-tabs.spec.ts` |
| F–J limites e 1024 abas | `e2e/workspace-tabs.spec.ts` |
| K–L migração, cota, duas janelas | `e2e/persistencia.spec.ts` |
| M backup/ZIP | `e2e/backup.spec.ts`, `e2e/backup-zip.spec.ts`, `e2e/codingpack-ui.spec.ts` |
| N armazenamento persistente | `e2e/library34.spec.ts` |
| O Ctrl+V em Imagens | `e2e/imagens-colar.spec.ts` |
| P Planilhas (cor, XLSX) | `e2e/planilhas-cores.spec.ts` |
| Q Código (sandbox, ZIP) | `e2e/codigo.spec.ts` |
| R Pintar | `e2e/pintar.spec.ts` |
| S Visualizador | `e2e/visualizador.spec.ts`, `e2e/visualizador-midia.spec.ts` |
| T regressões dos apps | `e2e/apps-complete.spec.ts`, `e2e/text-*.spec.ts`, `e2e/pdf-anotacoes.spec.ts`, `e2e/qr-assistente.spec.ts`, `e2e/sorteio.spec.ts`, `e2e/text-links.spec.ts` |
| U offline | `e2e/offline.spec.ts` |
| V larguras 320–1280 | `e2e/responsive-all.spec.ts`, `e2e/interface.spec.ts` |
| W teclado, movimento reduzido, axe | vários (`axe` em quase todos os specs de app) |
