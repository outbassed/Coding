# Como desenvolver o Coding 2.0 (fluxo sem instalar nada)

O objetivo é simples: **editar → enviar → a nuvem confere → olhar o resultado**. Nada precisa ser instalado na máquina de quem edita.

## 1. Fluxo

1. Crie uma branch `feature/<assunto>-sonnet` a partir da branch base do trabalho.
2. Edite os arquivos, faça commit e envie (`git push`).
3. Abra um PR **em rascunho**. A partir daí, o GitHub Actions roda sozinho:
   - **Coding 2.0 foundation** (`coding-v2-ci.yml`): estrutura, TypeScript, testes unitários, build e testes e2e no navegador.
   - **Coding 2.0 capturas de tela** (`coding-v2-screenshots.yml`): fotografa o site compilado em vários aparelhos e guarda as imagens como *artifact* (14 dias).
   - **Pré-visualizações** da Cloudflare Pages e da Vercel: o endereço aparece em comentários do PR.
4. Leia os resultados (seção 2), corrija e envie de novo.
5. Quando estiver verde e **o dono autorizar**, mescle o PR na branch base. Nada publica a produção automaticamente.

## 2. Ferramentas (`scripts/dev/`)

Precisam só do `gh` (GitHub CLI) autenticado. Usam `GITHUB_REPOSITORY` ou, se vazio, `outbassed/Coding`.

| Script | Para quê |
| --- | --- |
| `ci-wait.sh <sha>` | Espera `build` e `shots` terminarem e mostra o resultado. |
| `ci-report.sh <sha>` | Mostra passos que falharam, o resumo dos testes e as anotações (avisos de layout, medições). |
| `shots-get.sh <sha> [pasta]` | Baixa as capturas: `<pasta>/<aparelho>/<tema>/<tela>.png`. |
| `preview-url.sh <pr>` | Lista os endereços de pré-visualização do PR. |

## 3. Capturas de tela (conferir layout)

- Aparelhos: `desktop` 1440×900, `notebook` 1280×720, `tablet-retrato` 820×1180, `tablet-paisagem` 1180×820, `celular` 390×844, `celular-pequeno` 360×640.
- Telas: o Launcher (início, Meus apps cheio e vazio, catálogo, detalhes, documentos, ajustes), a Central de Versões, **um editor por aplicativo do catálogo** (apps novos entram sozinhos) e estados que costumam quebrar (ex.: Etiquetas com 5 itens).
- O robô também **avisa** (anotação `::warning`) quando uma página rola na horizontal, ou rola na vertical num editor, que deveria caber na janela. Foi esse tipo de medição que achou o bug de rolagem das Etiquetas.
- **Acrescentar uma tela ou estado:** edite `shots/routes.ts` (um objeto com `name`, `path` e, se preciso, `before`/`after` para preparar dados). Dados de teste sempre em contexto limpo.
- **Rodar só parte:** em *Actions → Coding 2.0 capturas de tela → Run workflow* (disponível depois que o arquivo estiver na branch padrão) informe `filter`, `schemes` (`light,dark`) e `devices`. Em PRs, roda tudo no tema claro.
- Para ver as imagens: `shots-get.sh <sha>` e abra os PNG.

## 4. Pré-visualização ao vivo

`preview-url.sh <pr>` mostra o endereço do deploy do PR (Cloudflare Pages `*.pages.dev`, Vercel). Lá a instalação offline funciona em `*.pages.dev`; nos endereços de produção ela fica desligada de propósito.

## 5. Investigar um bug sem rodar o app localmente

1. Escreva uma medição (ou teste) que reproduza o problema em `e2e/` ou `shots/` e imprima o que importa com `process.stdout.write('::notice title=...::' + texto)` (até ~3,8 mil caracteres por anotação).
2. Envie e leia com `ci-report.sh`.
3. Corrija e troque a medição por um **teste de regressão** permanente.
4. Remova arquivos e configurações temporárias antes do commit final.

## 6. Regras que nunca mudam

- **Produção:** nada é publicado automaticamente; trabalhe em branches de desenvolvimento; merge só com autorização do dono.
- **Dados das pessoas:** nunca apagar nem reescrever projetos, documentos, backups ou configurações; não abrir o banco legado `coding-db`; migrações precisam de teste.
- **Versões:** ao mexer em um app ou no Launcher, registre a versão em `src/shared/versions-data.ts` (`node scripts/stamp-build.mjs` dá a compilação) e ajuste os testes que fixam versões.
- **Ambiente de trabalho sem rede:** não tente instalar dependências; use a CI.
