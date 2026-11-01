# Coding · regras de trabalho para agentes (Claude)

O app novo fica em `coding-v2/` (Vue 3 + TypeScript + Vite). O Coding 1.0 (arquivos soltos na raiz) é a versão publicada: **não mexa nele**.
Guia completo do fluxo: `coding-v2/DESENVOLVIMENTO.md`.

## Como trabalhar (sem instalar nada)
- **Não tente instalar dependências nem acessar o npm no seu ambiente.** A rede costuma ser bloqueada; não insista nem contorne.
- Edite os arquivos, faça commit e `git push` para uma branch `feature/<assunto>-sonnet`, e abra um PR **em rascunho** pela API REST (`gh api repos/outbassed/Coding/pulls ...`; o GraphQL é bloqueado).
- Quem compila, roda TypeScript, testes unitários e e2e é o **GitHub Actions** (`coding-v2-ci.yml`). Veja o resultado com `coding-v2/scripts/dev/ci-wait.sh <sha>` e `ci-report.sh <sha>`.
- Para conferir **layout**, o Actions fotografa o site em desktop, notebook, tablet e celular (`coding-v2-screenshots.yml`). Baixe com `scripts/dev/shots-get.sh <sha>` e olhe as imagens com a ferramenta Read. Para ver o site rodando, use `scripts/dev/preview-url.sh <pr>` (Cloudflare Pages/Vercel).
- Para investigar um bug, escreva um teste ou uma medição em `e2e/` ou `shots/`, rode na CI e leia as anotações (`::notice`/`::warning`). Remova o diagnóstico temporário antes do commit final.

## Limites (sempre valem)
- **Não altere a produção.** Trabalhe só em branches de desenvolvimento. Faça merge apenas quando o dono autorizar de forma explícita, e só na branch base do PR. Não declare uma versão como "publicada oficialmente" sem autorização.
- Produção do Coding 1.0: `codingtxt.vercel.app` e `coding-seven-sigma.vercel.app` (a instalação offline fica desligada nesses endereços).
- **Preserve os dados das pessoas**: nunca apague nem reescreva projetos, documentos, backups ou configurações; não abra o banco legado `coding-db`; mudanças de formato de dados precisam ser compatíveis com o que já está salvo e ter teste de migração.
- Os testes usam contextos limpos de navegador; nunca dependem de dados reais.

## Versões
Ao mexer no código de um app ou do Launcher, registre uma nova versão em `coding-v2/src/shared/versions-data.ts` (rode `node coding-v2/scripts/stamp-build.mjs` para obter compilação, data e hora) e ajuste os testes que fixam versões. A Central de Versões (`/versoes/`) lê desse arquivo.

## Convenções
- Commits terminam com as linhas de atribuição pedidas pela sessão (`Co-Authored-By` e `Claude-Session`), autor `Claude <noreply@anthropic.com>`; PRs terminam com `🤖 Generated with [Claude Code](https://claude.com/claude-code)` e o link da sessão.
- Ao enviar com `git push origin HEAD:<branch>`, atualize a referência local para o hook de fim de sessão: `git fetch --depth=1 origin +refs/heads/<branch>:refs/remotes/origin/<branch>`.
- Cuidado: `pkill -f` com texto que aparece no próprio comando derruba a sua shell.
