# Reformulação do Launcher, offline e versionamento

Este documento resume o que mudou e como cada parte funciona. Nada aqui altera o Coding 1.0, a publicação oficial, o `coding-db` ou configurações de deploy.

## Identidade
A interface pública usa apenas **Coding** e **Coding Launcher**. Números de versão aparecem só como informação técnica (Ajustes → Sobre, Detalhes e Central de Versões). Pastas, rotas, bancos e chaves de armazenamento técnicos não foram renomeados.

## Início
Página de acesso rápido: identidade, busca de aplicativos, grade com os 15 apps (favoritos primeiro) e documentos recentes compactos. As estatísticas do topo foram para **Ajustes → Geral**; os botões que repetiam a navegação foram removidos.

## Ajustes em abas
Geral · Aparência · Projetos · Offline · Atalhos · Avançado · Sobre. A aba vai na barra de endereço (`#/ajustes?aba=offline`): link direto, recarregar e Voltar funcionam. No computador, categorias à esquerda e só a atual à direita; abaixo de 760 px, um seletor compacto. As preferências existentes mantêm chaves e valores.

## Sem ativação
Os 15 apps estão sempre disponíveis online. Controles, diálogos e bloqueios de ativação foram removidos. A chave antiga `coding-v2-apps` é **ignorada e não é apagada** (migração segura: nada é perdido e nada precisa ser migrado). Favoritos, ordem, busca, atalhos e recentes não mudaram.

## Offline por app
`stores/offline.ts` + `offline/engine.ts` + manifesto `offline-manifest.json` + service worker genérico, como antes. Ações: Instalar offline, Cancelar, Atualizar offline, Reparar instalação (quando o navegador apagou arquivos) e Desinstalar offline. Aparecem em **Detalhes** (seção “Uso offline”) e em **Ajustes → Offline**, lendo o mesmo estado. Desinstalar remove só arquivos que nenhum outro app instalado usa; não apaga documentos, backups nem preferências e não impede o uso online. Não é a instalação como PWA. Só funciona em HTTPS/localhost.

## Versionamento independente
Registro tipado e único: `src/shared/versions.ts` (modelo, formatos, validação) + `src/shared/versions-data.ts` (os lançamentos). O Launcher e cada um dos 15 apps têm versão semver própria. A **compilação** (`DD.MM.AA.HHMMSS`, America/Sao_Paulo, com zeros) é separada da **data e hora de lançamento**. A versão principal só muda ao registrar um lançamento. Para publicar uma versão: acrescente um item em `versions-data.ts` (a validação de testes recusa formato inválido, repetição e lançamento anterior à compilação). `scripts/stamp-build.mjs` gera uma compilação no formato correto.

Observação honesta: as datas de lançamento do registro inicial vêm dos commits reais; devem ser revistas no momento da publicação oficial.

## Central de Versões
`/versoes/` (Launcher), `/versions/` (alias) e `/versoes/<slug>/` por app, com cabeçalho próprio, menu lateral (gaveta com ☰ no celular), lista compacta `Nome — Versão — Compilação — Data e hora`, e modal com as seções presentes. Cada rota é gerada como arquivo estático no build (`scripts/versions-routes-plugin.ts`), então acesso direto, recarregar e compartilhar funcionam no Cloudflare Pages sem regras de reescrita.

Limitação: as páginas de `/versoes/` não fazem parte do pacote offline.

## Testes
`npm run test:structure`, `typecheck`, `test:unit`, `build` e `test:e2e` (CI do PR). Novos: `versions.test.ts`, `route.test.ts`, `tabs.test.ts`, `views/launcher.test.ts`, `e2e/versoes.spec.ts`, `e2e/launcher-reform.spec.ts` e os cenários de offline em Detalhes.
