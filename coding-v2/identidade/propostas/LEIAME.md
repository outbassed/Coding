# Propostas de nova identidade do Coding (para escolha)

**Nada aqui está em produção.** A logo oficial atual (`public/legacy-icons/coding.svg`) continua sendo a única usada pelo site, pelo PWA e pelo Launcher até a escolha do dono do projeto. Estes arquivos ficam fora de `public/` e não entram no build.

Todas as peças são SVG vetorial real (`path`, `rect`, `circle`, `polygon`, gradientes), sem PNG incorporado e sem fontes: o nome "coding" é desenhado com traços.

| Proposta | Ideia | Detalhe |
|---|---|---|
| **A · Órbita** | Um "C" aberto que abraça quatro blocos coloridos | Cada bloco usa a cor de um app do catálogo (Etiquetas, Texto, Planilhas, QR): o ecossistema dentro do C. No favicon vira um único ponto. |
| **B · Blocos** | Um "C" montado com barras arredondadas + um ponto verde | Evoca o empilhar de apps/cartões; formato bem distinto do ícone de documento do Texto. |
| **C · Célula** | "C" dentro de um hexágono, com um núcleo dourado e dois satélites | Aparência de módulo/plataforma; o contorno hexagonal é a forma mais diferente do ícone quadrado do Texto. |

Arquivos de cada pasta (`a/`, `b/`, `c/`): `logo-completa-claro.svg`, `logo-completa-escuro.svg`, `simbolo.svg`, `icone-app.svg`, `favicon.svg` (detalhes finos removidos para ler em 16 px) e `abertura.svg` (versão para a tela de abertura, tema escuro).

Para integrar a escolhida: copiar os SVGs para `public/`, trocar o ícone do manifesto/favicons e a tela de abertura, e registrar a nova versão. Isso só deve ser feito após a aprovação.
