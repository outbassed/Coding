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

- **Casca única dos editores** (`src/editors/EditorShell.vue`): no computador, abas de ferramentas no topo (como Word/Docs), documento no centro e painel lateral quando útil; no celular, prévia em cima e ferramentas embaixo (como CapCut), acompanhando o teclado virtual (`visualViewport`) e as áreas seguras. Etiquetas e Texto mantêm as interfaces próprias, já testadas, com o mesmo princípio.
- **Documentos** (`src/editors/useDocument.ts` + `docs.ts`): abrir, criar a partir de modelo, salvar automaticamente só depois de uma alteração, desfazer/refazer, Ctrl+S, proteção contra conflito de revisão (nunca sobrescreve em silêncio) e “Salvo” só depois da transação do IndexedDB terminar. Arquivos binários (fotos, PDFs) ficam como Blobs no armazenamento de ativos do documento.
- **Armazenamento**: banco próprio `coding-v2-documents`. Backups JSON e `.codingpack` preservados. A importação mantém as datas originais quando são plausíveis. Miniaturas da biblioteca leem só o estado do documento, sem ler Blobs (`getCopyState`).
- **Arquivos sem dependências novas**: ZIP, CSV, XLSX e DOCX próprios (`src/shared/files/`, `src/text/docx.ts`); PDF com `pdf-lib` e `pdf.js` reaproveitados do Coding 1.0 (`public/vendor/`, carregados só no Editor PDF); QR com o gerador do Coding 1.0 (`src/vendor/qrcode-generator.js`).
- **Ativação de apps**: preferência v2 (`coding-v2-apps`). Apps novos entram ativados; o que a pessoa desativou continua desativado. Ativar não instala nada nem promete uso offline.

## Proteção de dados

- O banco `coding-db` do Coding 1.0 nunca é aberto para escrita. Migração entre domínios só por exportação/importação feitas pela pessoa.
- Nada é apagado automaticamente; importações não substituem documentos existentes.
- O HTML do Texto é sempre saneado (lista fechada de tags, estilos e imagens `data:`).
- Documentos de formatos antigos do 1.0 com o mesmo tipo não são reinterpretados pelos apps novos (ficam na biblioteca, com backup, mas não abrem num editor que poderia corrompê-los).

## Offline / PWA

Não há service worker nem manifesto nesta prévia (verificado por `npm run test:structure`). Os apps precisam de internet para abrir; depois de abertos, editar e salvar funcionam no aparelho.
