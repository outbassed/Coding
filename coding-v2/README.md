# Coding 2.0 · Prévia completa

Esta pasta contém o **Coding 2.0**, em Vue 3 + TypeScript + Vite multipágina + Pinia + Tailwind CSS 4. **A aplicação do Coding 1.0, na raiz do repositório, está preservada** e o banco `coding-db` do 1.0 nunca é alterado por esta base.

Lista de funcionalidades por app: [PREVIEW-COMPLETA.md](./PREVIEW-COMPLETA.md) · Pendências conhecidas: [POST-PREVIEW-BUGFIX.md](./POST-PREVIEW-BUGFIX.md)

## Rodar localmente

Pré-requisito: Node.js 20.19+ ou 22.12+ e acesso ao npm.

```bash
cd coding-v2
npm ci
npm run test:structure
npm run typecheck
npm run test:unit
npm run build
npx playwright install chromium   # uma vez
npm run test:e2e
npm run dev
```

## Endereços

| Endereço | O que é |
| --- | --- |
| `/launcher/` | Launcher: Início, Meus apps, Catálogo, Detalhes, Documentos (biblioteca e backups) e Ajustes |
| `/apps/etiquetas/` | Etiquetas |
| `/apps/texto/` | Texto |
| `/apps/planilhas/` | Planilhas |
| `/apps/imagens/` | Imagens |
| `/apps/pdf/` | Editor PDF |
| `/apps/qr/` | QR / Barras |
| `/apps/planilha-etiquetas/` | Planilha → Etiquetas |
| `/apps/sorteio/` | Sorteio |
| `/apps/racha-conta/` | Racha-conta |

Todo app aceita `?doc=<id>` (abre um documento salvo) e `?modelo=<id>` (começa por um modelo editável). Sem parâmetro, abre o primeiro modelo: dá para experimentar sem enviar arquivo.

## Arquitetura

- **Casca única dos editores** (`src/editors/EditorShell.vue`): segue o **padrão Etiquetas**. No computador, ferramentas em uma sidebar esquerda de 296–460 px, ajustável/recolhível, e prévia à direita; a lista de miniaturas do Editor PDF fica dentro da sidebar. No celular/tablet estreito, a prévia fica acima da gaveta de ferramentas, que pode ser recolhida, expandida por etapas e ajustada arrastando a alça, com categorias fixas na parte inferior. O layout respeita o teclado virtual (`visualViewport`) e as áreas seguras. Os nove aplicativos mantêm seus próprios recursos de edição; Texto e Etiquetas usam cascas próprias com o mesmo princípio.
- **Documentos** (`src/editors/useDocument.ts` + `docs.ts`): abrir, criar a partir de modelo, salvar automaticamente só depois de uma alteração, desfazer/refazer, Ctrl+S, proteção contra conflito de revisão (nunca sobrescreve em silêncio) e “Salvo” só depois da transação do IndexedDB terminar. Arquivos binários (fotos, PDFs) ficam como Blobs no armazenamento de ativos do documento.
- **Armazenamento**: banco próprio `coding-v2-documents`. Backups JSON e `.codingpack` preservados. A importação mantém as datas originais quando são plausíveis. Miniaturas da biblioteca leem só o estado do documento, sem ler Blobs (`getCopyState`).
- **Arquivos sem dependências novas**: ZIP, CSV, XLSX e DOCX próprios (`src/shared/files/`, `src/text/docx.ts`); PDF com `pdf-lib` e `pdf.js` reaproveitados do Coding 1.0 (`public/vendor/`, carregados só no Editor PDF); QR com o gerador do Coding 1.0 (`src/vendor/qrcode-generator.js`).
- **Ativação de apps**: preferência v2 (`coding-v2-apps`). Apps novos entram ativados; o que a pessoa desativou continua desativado. Ativar não instala nada nem promete uso offline.

## Proteção de dados

- O banco `coding-db` do Coding 1.0 nunca é aberto para escrita. Migração entre domínios só por exportação/importação feitas pela pessoa.
- Nada é apagado automaticamente; importações não substituem documentos existentes.
- O HTML do Texto é sempre saneado (lista fechada de tags, estilos e imagens `data:`).
- Documentos de formatos antigos do 1.0 com o mesmo tipo não são reinterpretados pelos apps novos (ficam na biblioteca, com backup, mas não abrem num editor que poderia corrompê-los).

## Offline / PWA (Preview isolado, opt-in)

Há uma implementação **experimental** de cache estático offline, desativada por padrão para proteger a versão 1.0. Não afeta o IndexedDB nem armazena documentos, backups ou respostas de API em cache.

Para testar exclusivamente num domínio HTTPS separado do Coding 1.0:

```bash
VITE_CODING_PREVIEW_PWA=1 npm run build
npm run preview
```

No Launcher, vá a **Ajustes → Uso sem internet → Preparar acesso offline**. O navegador baixa os arquivos *reais do build*, incluindo as nove páginas, chunks, estilos, ícones e as bibliotecas locais de PDF. Se algum arquivo falhar, a instalação do worker não é concluída; a versão anterior permanece ativa. Depois da preparação, as páginas visitadas podem abrir sem rede, com os documentos já salvos no IndexedDB local.

- O serviço é registrado somente por ação explícita nos Ajustes e apenas em HTTPS ou localhost. Há bloqueio adicional dos domínios conhecidos da versão 1.0.
- O service worker tem escopo `/` e foi projetado **somente para um projeto Vercel Preview separado**, cujo domínio seja dedicado ao Coding 2.0. Não ative o sinalizador em um domínio compartilhado com a versão 1.0.
- No uso online, páginas HTML são buscadas primeiro da rede; JS/CSS e demais assets são entregues do cache versionado da compilação. Offline, os arquivos preparados são servidos localmente.
- A instalação como aplicativo PWA é um recurso do navegador, distinto da ativação de atalhos e do cache offline. Safari/iOS e a instalação em aparelhos reais continuam sem validação manual.
- O modo offline não sincroniza documentos entre aparelhos. Use as exportações de backup da Biblioteca para transferência de dados.

### Hospedagem Cloudflare Pages (Preview alternativo)

- Projeto isolado: `coding-v2`, endereço `https://coding-v2.pages.dev/launcher/#/`.
- Branch: `feature/coding-v2-unified-editor-layout-gpt` (não a `main`).
- Diretório raiz: `coding-v2`; build: `npm run build`; saída: `dist`.
- Apenas commits da branch configurada geram deploys, sem previews de outras branches.
- O projeto Vercel e o Coding 1.0 não são modificados.
