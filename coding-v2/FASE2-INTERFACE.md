# Fase 2 · Interface Vue (Claude Sonnet 5.5)

Branch `coding-v2`, pasta `coding-v2/`. A `main`, o deploy atual e o banco `coding-db` **não foram tocados**.

## O que foi implementado

**Design system**
- Tokens em `src/styles/tokens.css` (Tailwind 4 `@theme inline`): superfícies, texto, bordas, acento, estados (`ok`, `warn`, `danger`), três temas (automático, claro, escuro) e pontos de quebra 600 / 900 / 1280 / 1920.
- Cores das nove ferramentas em `src/shared/catalog.ts`: preenchimento da marca, tinta escura `#141922` sobre ele e variantes de **texto** para tema claro e escuro. Contraste mínimo 4,5:1 verificado em teste de unidade.
- Ícones SVG coloridos (`AppIcon`) e ícones de navegação (`NavIcon`), sem caracteres Unicode.
- Sem piscada de tema: script inline no `<head>` das três entradas HTML; `theme-color` acompanha o tema.
- Áreas seguras (`env(safe-area-inset-*)`) em barras, navegação, gavetas e folha.

**Launcher** (`/launcher/`)
- Vue Router com histórico por hash (`/launcher/#/catalogo`): não exige regras de reescrita no servidor e preserva as páginas HTML independentes dos apps (`/apps/etiquetas/`, `/apps/texto/`).
- Telas: Início, Meus apps, Catálogo (busca sem acento + filtros), **Detalhes do aplicativo**, Documentos, Ajustes, página não encontrada.
- Componentes: `AppShell`, `TopBar`, `SideNav` (trilho no tablet, completa no desktop), `BottomNav` (celular), `PageHeader`, `AppCard`, `AppGrid`, `StatusPill`, `EmptyState`, `ActivateButton`, `ConfirmDialog` (`<dialog>` nativo) e `DeactivateDialog`.
- Detalhes separa três conceitos: **Ativado no Launcher** (preferência real), **Disponível offline** (sempre "Não verificado": não existe verificação) e **Instalado como aplicativo** (sempre "Não comprovado"). Ativar nunca implica os outros dois (`src/shared/levels.ts`, testado).
- Apps ainda não migrados não têm botão de ativar; oferecem "Abrir no Coding atual" apontando para a rota equivalente da versão estável.
- Acessibilidade: link para pular, foco no título a cada troca de tela, título da aba por rota, região `aria-live`, nomes acessíveis específicos nos botões ("Ativar Texto no Launcher"), hierarquia de títulos, alvos de toque de 44 px.

**Editores Etiquetas e Texto** (prévia)
- Desktop: barra superior, faixa de comandos com abas (teclado: setas), folha A4 (210 × 297) com zoom 50–200 %, painel lateral "Propriedades", barra de status.
- Tablet: faixa de comandos + gaveta inferior.
- Celular: prévia em cima, barra de ferramentas embaixo e gaveta contextual (3 alturas; prévia mantém ao menos 220 px).
- Identidade: cor da ferramenta na borda da barra, aba ativa, chips e ícone; texto de cor usa a variante com contraste.
- **Sempre marcados como prévia:** faixa "Prévia ilustrativa", selo "Prévia · nada é salvo" e todos os comandos desativados. Reais: abas, zoom, abrir/fechar painel e gaveta.
- `SaveStatus` já prevê os cinco estados de salvamento, mas só `preview` é usado.

**Testes**
- `npm run test:structure`: arquivos, nove apps, tema sem piscada, **nenhuma PWA**, **nenhum acesso a `coding-db`**.
- `npm run test:unit` (Vitest + jsdom + axe): catálogo, contraste, níveis, store de apps, telas, ativação/desativação, editores nos três tamanhos, acessibilidade.
- `npm run test:e2e` (Playwright, Chromium, contra o build): 8 larguras de 320 a 1920 sem rolagem horizontal, folha em proporção A4, navegação por tamanho, rotas/Voltar/recarregar, foco, persistência, tema escuro antes da montagem, ausência de manifest/service worker e axe (WCAG 2.1 AA) em claro e escuro.
- `package-lock.json` gerado pelo CI e CI com `npm ci`.

## Limitações restantes

- Os testes foram executados **no CI do GitHub**, não no aparelho nem num navegador local. Nada foi testado em celular real, Safari/iOS ou Firefox.
- Teclado virtual: não há tratamento de `visualViewport`; o comportamento com teclado aberto no celular **não foi testado**.
- A gaveta tem três alturas por botão; **arrastar** não foi implementado.
- Nenhum estado de offline, tamanho, progresso de download ou instalação é medido: são apenas rótulos honestos.
- A folha de etiquetas é uma grade 3 × 8 genérica, não os modelos reais.
- Sem leitura do banco antigo; Documentos mostra um aviso.
- O estado de ativação é guardado em `localStorage` (`coding-v2-apps`, versionado `{ v: 1, enabled }`; aceita também a lista simples do protótipo) e sincroniza entre abas pelo evento `storage`. Não lê `coding-nav-v1` do app estável.
- Rotas por hash foram escolhidas para não depender da hospedagem; histórico limpo é decisão do GPT-6 Alta.
- Textos de interface precisam de revisão final de tom (casual e divertido) pelo proprietário.

## Para o GPT-6 Alta

1. Revisar a integração Vue Router + Vite multipágina e decidir hash × histórico limpo na Vercel.
2. Adaptador seguro de documentos (IndexedDB legado, escrita transacional, revisão, conflitos entre abas) antes de ligar `SaveStatus`.
3. Service workers, manifestos, lista de arquivos e verificação real de offline; só então trocar "Não verificado".
4. Estratégia de migração dos motores (isolamento de CSS: as classes globais `.btn`, `.muted`, `.skip-link` e `.app-text` de `base.css` podem colidir com o `style.css` legado).
5. Decidir se `localStorage` segue como armazenamento de preferências ou migra para o banco.
6. Revisar `scripts/check-structure.mjs` (verificações por texto) e a política de dependências.
