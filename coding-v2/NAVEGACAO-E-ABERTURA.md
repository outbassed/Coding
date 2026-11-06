# Navegação, retomada e tela de abertura (Coding Launcher 2.3.2)

Resumo técnico do que existe no Launcher 2.2.1. O Visualizador continua em 2.0.0 e nenhum aplicativo teve a lógica interna alterada.

## Olho interativo do Visualizador
- Só em `/launcher/#/app/viewer` (`ViewerEyeAnimatedIcon.vue`, usado por `AppDetailsView.vue` quando `tool.id === 'viewer'`). Catálogo, editor e demais telas usam o ícone estático.
- Animação inicial única (esquerda → direita → centro). Clique (ou Enter/Espaço) liga o acompanhamento do cursor; o segundo clique desliga e centraliza. Cursor fora da janela, perda de foco ou aba oculta centralizam.
- Íris, pupila e reflexo se movem juntos. Limite geométrico em `eyeGeometry.ts` (contorno da amêndoa resolvido em Béziers, deslocamento máximo por direção) mais uma máscara SVG como segunda barreira.
- `prefers-reduced-motion` e `data-motion="reduce"`: sem animação automática, movimento instantâneo. Nada é armazenado nem enviado.

## Retomada da última tela (todos os dispositivos, sem limite de tempo)
- Registro único em `localStorage`: `coding-v2-session` = `{ v: 1, at, here, origin }`. Compatível com os registros anteriores, sem migração ou apagamento.
- Funciona em **computadores, tablets e celulares**, tanto no navegador quanto na PWA, se o mesmo perfil de navegador mantiver os dados locais. Não há sincronização entre aparelhos distintos.
- Quando a pessoa abre o Coding pela entrada principal (`/` ou `/launcher/` sem rota), o Launcher restaura a última tela ou app, mesmo após dias, semanas ou meses. A última rota também pode incluir `?doc=<id>`.
- Só retoma em entrada fria; recarga, histórico, clique em “Início” e links explícitos têm prioridade. O indicador de avaliação na aba (`coding-v2-resume-done`) impede ciclos.
- As rotas são validadas por lista fechada. Antes de abrir um documento salvo, verifica-se se ainda existe no IndexedDB em modo somente leitura. Se foi apagado, abre o Início, sem criar cópias.
- A origem do botão “Voltar” continua vencendo depois de 20 minutos de inatividade, **mas a última tela nunca vence por tempo**. Nenhum documento, favorito, ajuste ou backup é apagado pelo mecanismo.

## Voltar à origem
- Ao abrir um app, a tela do Launcher em uso (Início, Meus apps, Catálogo ou Detalhes) vira a origem, guardada no registro e em `sessionStorage` (`coding-v2-origin`).
- O link "Início" de cada app (que aponta para `/launcher/#/`) é tratado por um listener de captura em `navSession.ts`; só no clique simples ele leva à origem. Rótulo e dica passam a "Voltar para …". O `href` original permanece.
- Recarga, histórico do navegador e passagem entre apps mantêm a origem. Acesso direto, origem inválida, Documentos/Ajustes ou sessão vencida: Início.
- Integração compartilhada isolada em `navMemory.ts` (lógica pura), `navSession.ts` (navegador) e uma linha em cada ponto de entrada (`boot.ts`, `main-labels.ts`, `main-editor.ts`).

## Tela de abertura (`/`)
- `index.html` de HTML e CSS puros, sem Vue e sem módulos: logo, "Coding Launcher", "Abrindo o Launcher...", barra discreta e link "Abrir o Coding Launcher".
- Tema por script embutido (claro, escuro, salvo em `coding-v2-theme`), sem flash branco; movimento reduzido para a barra.
- Redireciona na hora com `location.replace('/launcher/')`; sem JavaScript, `<noscript>` com meta refresh. O Launcher decide a retomada.
- URLs diretas de apps e do Launcher não passam por ela.

## Identidade visual
Três propostas em `identidade/propostas/` (fora do build). A logo oficial só muda depois da escolha do dono do projeto.

## Testes
Unitários: `eyeGeometry`, `navMemory`, `navSession`. E2E: `viewer-eye-icon`, `navegacao-retomada` (todos os dispositivos, dias/semanas, documento sem duplicar, links diretos), `navegacao-origem`, `tela-abertura` (temas, movimento reduzido, 320/390/1280 px, axe, sem JS).
