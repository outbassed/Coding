# Coding

O **Coding** é um ecossistema de aplicativos leves para criar, editar, visualizar, organizar e imprimir arquivos. A **versão atual** é feita em Vue 3 + TypeScript + Vite e está em [`coding-v2/`](./coding-v2/).

**Abrir o Coding:** https://codingtxt.vercel.app/

## Aplicativos

O Launcher reúne 16 aplicativos, incluindo Etiquetas, Texto, Planilhas, Imagens, Editor PDF, QR/Barras, Sorteio, Racha-conta, Calculadora, Estúdio de Cores, ZIP, Comparador, Código, Visualizador, Pintar e Versos.

Cada aplicativo possui recursos e interface próprios. A documentação técnica, a lista de rotas e as instruções de desenvolvimento ficam em [`coding-v2/README.md`](./coding-v2/README.md).

## Executar localmente

É necessário Node.js compatível com o `package.json` do projeto:

```bash
cd coding-v2
npm ci
npm run dev
```

Para verificar antes de publicar:

```bash
cd coding-v2
npm run test:structure
npm run typecheck
npm run test:unit
npm run build
npm run test:e2e
```

A suíte E2E requer o Chromium do Playwright instalado. Confira [`coding-v2/DESENVOLVIMENTO.md`](./coding-v2/DESENVOLVIMENTO.md) para o fluxo da CI.

## Organização do repositório

- [`coding-v2/`](./coding-v2/): **aplicação atual**, código, recursos, testes e documentação.
- [`.github/workflows/`](./.github/workflows/): validação e capturas automáticas.
- [`vercel.json`](./vercel.json): publicação do build de `coding-v2/dist`.
- [`CLAUDE.md`](./CLAUDE.md): orientações para agentes de desenvolvimento.

A pasta mantém o nome técnico `coding-v2` para preservar os caminhos de build, CI e publicação existentes. **Não há um Coding 1.0 separado na árvore atual.** Os arquivos antigos continuam recuperáveis no histórico de commits do GitHub, caso seja necessário consultar uma implementação anterior.

## Dados e compatibilidade

Limpar arquivos do repositório **não apaga documentos ou configurações armazenados no navegador**. O Coding atual mantém seus próprios dados no navegador e não deve escrever no banco legado `coding-db`. Não apague nem migre dados de usuários sem uma estratégia de backup testada.

A identidade oficial do Coding e do Coding Launcher é a mesma marca **CD · Negativo**. Os ícones individuais dos aplicativos continuam próprios.
