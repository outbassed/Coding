# Coding Versos 1.0.0

Editor de **composição tipográfica para imagens**: letras de música, frases, citações e títulos, em dezenas de cenas ou numa só imagem. Categoria do catálogo: *Criação e tipografia*. Nome em inglês: **Lyric**.

O Versos **não é um editor de vídeo** e não duplica o app Imagens: não há linha do tempo, duração, sincronização nem exportação de vídeo. Cada cena é uma imagem estática; a troca de cena é sempre manual.

> Estado: implementado numa branch/PR em rascunho. Nada foi mesclado nem publicado; a versão 1.0.0 consta no registro da Central de Versões, mas **não foi declarada lançada oficialmente**.

## Endereços

| Endereço | Papel |
| --- | --- |
| `/apps/versos/` | Rota canônica (mesmo padrão `/apps/<nome>/` de todos os apps: catálogo, Biblioteca, offline, versões). |
| `/versos/` | Alias curto. É a **mesma página** (gerada no build por `scripts/app-aliases-plugin.ts`; no servidor de desenvolvimento, um middleware). Ao criar/salvar o projeto, o endereço vira `/apps/versos/?doc=<id>`, como nos outros apps. |
| `/apps/versos/?doc=<id>` · `?modelo=<id>` | Abre um projeto salvo / começa por um modelo (`em-branco`, `letra`, `citacao`, `story`, `transparente`). |

## O que existe

- **Cenas independentes** (id estável, nome, textos, fundo, resolução, proporção, ordem de camadas): criar, selecionar, duplicar (ids novos), copiar, colar (**sempre cria uma cena nova**, nunca substitui), recortar, excluir, reordenar por botões, anterior/próxima, miniaturas leves (desenhadas só quando visíveis, em baixa resolução). Excluir a última cena deixa uma cena inicial vazia.
- **Área de transferência interna** entre cenas e entre projetos Versos (mantém também o fundo em imagem, até ~1,8 MB espelhados em `localStorage`; na mesma página o limite é a memória).
- **Textos**: vários blocos por cena com conteúdo, fonte, tamanho, peso, itálico, cor, opacidade, alinhamento, espaçamento entre letras e linhas, contorno, sombra (cor, intensidade, desfoque, deslocamento), posição, largura, rotação, ordem de camadas, duplicar, excluir e ocultar. Campos numéricos são o caminho principal; arrastar/redimensionar/girar na prévia é opcional.
- **Estilos**: 7 estilos prontos, copiar/colar formatação, estilos salvos **dentro do projeto** e “usar a aparência de outra cena”. Aplicar estilo nunca troca conteúdo, posição, largura ou rotação.
- **Fundos** por cena: imagem (preencher/ajustar/esticar, zoom, posição), cor sólida (seletor + hexadecimal + opacidade) ou transparente. A grade xadrez existe só na tela (CSS atrás do canvas) e nunca entra na exportação.
- **Proporções**: 1:1, 16:9, 9:16, 4:5, 4:3 e personalizada; largura e altura em px (16 a 8192); a resolução é independente da proporção e cada cena tem a sua. Só valores inválidos são bloqueados, com mensagem.
- **Música/vídeo de referência (opcional)**: MP3, WAV, OGG, M4A, MP4, WebM etc. (o que o navegador tocar). De vídeo só o áudio toca (o `<video>` nunca entra na página). Controles próprios sobre elementos nativos: tocar/pausar, posição, tempo, volume/silenciar, nome, trocar, remover, recolher. Só toca depois de um clique; trocar/criar/duplicar/excluir cenas, editar ou exportar não interrompe nem reinicia. Ao sair de `/versos/`, recarregar ou fechar a aba, a reprodução termina (a URL temporária é liberada) e **nunca é retomada**. A mídia não é salva no projeto nem entra no ZIP.
- **Exportação estática**: PNG da cena, PNG de todas as cenas (arquivos separados), ZIP (todas ou um intervalo), **só os textos** com fundo transparente. Cada cena sai na própria resolução, na ordem do projeto, com nomes previsíveis (`projeto-001.png`, `projeto-001-texto.png`). Há progresso e cancelamento; o mesmo renderizador gera prévia, miniaturas e exportação (fidelidade máxima, sem reduzir qualidade em silêncio). O ZIP tem teto de 200 MB e 4000 arquivos, com mensagem clara ao ultrapassar.
- **Persistência**: pelo fluxo comum de documentos (`useDocument`): novo, abrir, salvar automático (800 ms depois da alteração), Ctrl+S, renomear, duplicar, excluir e proteção contra conflito entre abas. Imagens de fundo ficam como Blobs no armazenamento do documento (nunca `blob:`); o estado tem esquema versionado (`v: 1`) e é normalizado ao abrir.
- **Atalhos**: Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z, Ctrl+S, Ctrl+C/V/X/D (cenas ou textos, conforme o foco), Delete, PageUp/PageDown, setas (Shift = 10 px), Esc, Alt+Shift+N / Alt+Shift+E. **Dentro de campos de texto** todos esses atalhos são do campo.
- **Menu de contexto** (botão direito / toque longo): cena (copiar, recortar, colar, duplicar, mover, excluir), texto (copiar, recortar, colar, duplicar, copiar/colar formatação, camada, ocultar, excluir) e ferramentas do app.
- **Celular**: layout próprio — prévia em destaque, gaveta com abas (Cena, Textos, Estilos, Arquivo, Cenas, Propriedades), navegação simples entre cenas, alvos de toque ≥ 44 px, sem rolagem horizontal.

## Fontes

Não existe um sistema global de fontes no Coding. O Versos traz um **adaptador local** (`src/apps/versos/fonts.ts`) e um ponto de integração para o futuro app *Coding Fontes*:

```ts
import { registerFontProvider } from './fonts';
registerFontProvider({ id: 'coding-fontes', label: 'Coding Fontes', families: () => [/* FontFamilyDef[] */] });
```

Um provedor registrado passa a aparecer no seletor, é carregado sem bloquear a interface (`FontFace`, família interna `vs-<id>`) e entra na exportação. **O projeto guarda a identificação original da fonte** (`{ id, label }`): se ela não existir neste aparelho (ou falhar ao carregar), só a *exibição* usa a **Arimo**, com aviso, e o que está salvo nunca é sobrescrito. Nada é baixado automaticamente de fora.

Incluídas (WOFF, ~1,4 MB, todas **SIL Open Font License 1.1**; cada família tem o seu `OFL.txt` em `public/fonts/versos/<família>/`, com o aviso de direitos autorais original, e a lista de créditos aparece em Ajustes → Sobre):

| Família | Direitos autorais (resumo do aviso original) |
| --- | --- |
| Arimo (fonte substituta; métricas compatíveis com Arial) | The Arimo Project Authors |
| Montserrat | The Montserrat.Git Project Authors |
| Oswald | The Oswald Project Authors |
| Bebas Neue | Dharma Type |
| Anton | The Anton Project Authors |
| Playfair Display | The Playfair Display Project Authors |
| Cormorant Garamond | The Cormorant Project Authors |
| Lora | The Lora Project Authors |
| Great Vibes | The Great Vibes Pro Project Authors |
| Dancing Script | The Dancing Script Project Authors |
| Pacifico | The Pacifico Project Authors |
| Caveat | The Caveat Project Authors |

Fontes proprietárias (Arial, Times New Roman etc.) **não** são incluídas. Os caminhos dos arquivos são literais no código para que o gerador do pacote offline os encontre; o pacote offline do app (e do alias `/versos/`) leva todos os WOFF.

## Restrições de mídia (Ajustes → Projetos)

O Versos **não** tem tela própria de limites: usa *Ajustes → Projetos → Tamanho de arquivos importados* (`src/components/ui/ImportLimitsPanel.vue`, `src/workspace/importLimits.ts`, chave `coding-v2-import-limits`).

| Tipo | Avisar acima de | Bloquear acima de |
| --- | --- | --- |
| Áudio | 20 MB | 100 MB |
| Vídeo | 100 MB | 500 MB |
| Imagem de fundo | 10 MB | 40 MB |

São padrões conservadores e editáveis (1 MB a 20 GB); dá para **desligar** a verificação. Desligar não remove os limites reais do navegador/aparelho (memória, codecs, espaço): os erros de codec, leitura ou memória continuam sendo mostrados com mensagem clara. O arquivo de vídeo nunca é lido inteiro para a memória JavaScript (só referenciado por URL temporária).

## Arquitetura (`src/apps/versos/`)

| Arquivo | Papel |
| --- | --- |
| `model.ts` | Esquema, normalização, operações puras (cenas, textos, estilos, proporções, nomes de exportação). |
| `layout.ts` · `render.ts` | Quebra de linha/medidas e **um único** `renderScene` (prévia, miniaturas, exportação). |
| `imageStore.ts` | Cache LRU de imagens decodificadas (prévia ≤ 2048 px; exportação lê a original). |
| `fonts.ts` | Famílias, `FontProvider`, carregamento não bloqueante, substituição visual. |
| `clipboard.ts` | Copiar/colar de cenas, textos e formatação (também entre projetos). |
| `export.ts` | PNG/ZIP com progresso, cancelamento e tetos. |
| `media/` | Player de referência (núcleo testável sem DOM + singleton + volume salvo). |
| `controller.ts` | Estado e comandos da tela (seleção, cenas, textos, estilos, fundo, tamanho, exportação, teclado). |
| `*.vue` | `VersosApp`, `StageView`, `SceneList`/`SceneThumb`, `PanelScene/Texts/Styles/File`, `TextProps`, `PlayerBar`, `NumField`, `ColorField`. |

Integrações: `src/shared/catalog.ts`, `src/shared/versions*.ts`, `src/shared/contextMenu.ts`, `src/library/model.ts`, `src/previews/model.ts`, `src/components/ui/AppIcon.vue` (+ `public/legacy-icons/versos.svg`), `scripts/` (estrutura, alias, manifesto offline), `vite.config.ts`. A casca `EditorShell` ganhou duas propriedades opcionais (`startOpen`, `chrome`) usadas só pelo Versos no celular.

## Testes

- **Unitários** (Vitest): modelo/normalização, layout, fontes, renderização, exportação, área de transferência, cache de imagens, player, limites, prévias, catálogo, versões, Biblioteca.
- **E2E** (`e2e/versos.spec.ts`, Playwright/Chromium): lê **pixels reais** do canvas, baixa e **decodifica** os PNG/ZIP exportados, gera WAV/WebM de teste, mede a mídia por instrumentação (`play`/`pause`/`revoke`) e cobre os cenários da especificação: projeto, textos e formatação, vários textos, posição/ordem, fundos (imagem/cor/transparente), duplicar/copiar/colar/reordenar/excluir cenas, desfazer/refazer, salvar/reabrir/recarregar, exportações (PNG, só texto, ZIP, resoluções diferentes), música (áudio, vídeo só áudio, trocar de cena tocando, pausar/retomar, sair/recarregar, incompatível, restrições), fontes (falha e fonte inexistente), celular, teclado, menu de contexto, acessibilidade (axe, claro/escuro) e integração com o Launcher/offline.

## Limitações conhecidas

- Validado apenas em Chromium (Playwright). Safari/iOS e aparelhos reais não foram testados.
- Formatos de áudio/vídeo aceitos dependem do navegador; WebM gerado por `MediaRecorder` pode não informar a duração.
- O ZIP de exportação é limitado a 200 MB / 4000 arquivos; PNG muito grandes (acima de ~16,7 MP) mostram aviso e dependem da memória do aparelho.
- A sombra é deslocada no referencial da cena (não gira com o texto).
- A área de transferência entre projetos espelha no máximo ~1,8 MB de imagens em `localStorage`; acima disso só vale enquanto a página estiver aberta.
- Sem Coding Fontes ainda: o ponto de integração está pronto e documentado, mas não há download de fontes.
