# Identidade visual do Coding (CD · Negativo)

A marca oficial do Coding e do Coding Launcher é uma só: o monograma **CD · Negativo**. É um D branco com um C vazado no meio (espaço negativo, onde aparece o fundo) e um canto inferior direito cortado por uma fenda diagonal, em azul-gelo. A fenda vem da Fluxo · Corte.

A marca vale só para a plataforma. Os ícones individuais dos aplicativos (`public/legacy-icons/*.svg`) continuam como sempre foram.

## Arquivos (`public/brand/`)

| Arquivo | Uso |
|---|---|
| `icon.svg` | ícone principal (cabeçalho, Início, Sobre, Central de Versões, abertura, manifesto) |
| `icon-light.svg`, `icon-dark.svg` | ícone para superfícies claras e escuras |
| `icon-maskable.svg`, `icon-maskable-512.png` | ícone adaptável do Android (símbolo na zona segura, fundo até a borda) |
| `icon-192.png`, `icon-512.png` | PWA (manifesto) |
| `apple-touch-icon.png` | iPhone/iPad (180 px, sem cantos arredondados) |
| `favicon.svg`, `favicon-16.png`, `favicon-32.png`, `../favicon.ico` | abas do navegador; o desenho é simplificado para 16 px |
| `symbol.svg`, `symbol-white.svg` | símbolo isolado em fundo transparente (azul para fundo claro, branco para fundo escuro) |
| `logo-horizontal-light.svg`, `logo-horizontal-dark.svg` | ícone + "coding" para fundo claro e escuro |
| `splash-light.svg`, `splash-dark.svg` | composição vertical para telas de abertura |

Tudo em SVG é vetorial, feito de formas e caminhos, sem imagem embutida e sem fontes (a palavra "coding" é desenhada com traços). Os PNG existem só para a instalação como aplicativo e para o favicon clássico.

## Construção
- Tela de 512, quadrado arredondado (superelipse), gradiente `#5b8dff → #2f49e0 → #1a2688`.
- D: `M118 96H256A160 160 0 0 1 256 416H118Z`, com traço de 28 só para arredondar os cantos.
- C vazado: arco de raio 80 e espessura 54 (no favicon, raio 86 e espessura 62), centrado, aberto para a direita.
- Fenda: faixa diagonal entre `x+y=686` e `x+y=712`; o que passa disso é o canto em azul-gelo `#8fe9ff` (`#2bb5ec` nas versões para fundo claro).

## Onde a marca entra no código
`TopBar.vue` (cabeçalho), `HomeView.vue` (Início), `AboutPanel.vue` (Sobre), `VersionsApp.vue` (Central de Versões), `index.html` (tela de abertura), os `<link rel="icon">` de `index.html`, `launcher/index.html` e `versoes/index.html`, e `manifest.webmanifest`. As demais páginas usam o `/favicon.ico` padrão do navegador.
