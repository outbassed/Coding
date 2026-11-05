# Coding · regras para desenvolvimento

## Projeto oficial

O repositório contém **somente a aplicação atual do Coding**, no diretório `coding-v2/` (Vue 3 + TypeScript + Vite). O Coding 1.0 deixou de existir na árvore corrente; seu código pode ser consultado no histórico Git. **Não recrie, restaure ou edite o Coding 1.0 antigo** a menos que o dono solicite expressamente.

A produção é o [Coding](https://codingtxt.vercel.app/) e compila exclusivamente `coding-v2/` conforme `vercel.json`. O nome técnico da pasta foi mantido para não quebrar Vercel, CI, rotas ou scripts. A logo oficial, compartilhada por Coding e Coding Launcher, é **CD · Negativo**. Os 16 aplicativos mantêm ícones próprios.

Leia `coding-v2/README.md`, `coding-v2/DESENVOLVIMENTO.md` e `coding-v2/PLANEJAMENTO-FUTURO.md` antes de alterar recursos.

## Fluxo de trabalho

- Trabalhe numa **branch de desenvolvimento**, com PR. Não envie mudanças diretamente para `main`.
- Se o ambiente não permitir acesso ao npm, não force instalação nem contorne bloqueios; use a CI `coding-v2-ci.yml` para estrutura, TypeScript, testes unitários, build e E2E.
- A CI `coding-v2-screenshots.yml` valida layouts e gera capturas. O espelho `ci-capturas` não contém código de produção.
- Confira os resultados antes de pedir merge; **merge e publicação só mediante autorização do dono**. Verifique o deploy real antes de declarar uma versão como publicada.
- Ao alterar funcionalidades de aplicativo ou do Launcher, atualize `coding-v2/src/shared/versions-data.ts` e os testes correspondentes. Limpeza de arquivos antigos e documentação, sem mudança de funcionalidade, não exige incremento de versão.
- A configuração de hospedagem ativa é `vercel.json` da raiz; não a substitua por configuração legada.

## Segurança dos dados e compatibilidade

- **Nunca apague, reescreva ou migre automaticamente** documentos, projetos, backups, favoritos ou preferências de usuários.
- O armazenamento da aplicação atual inclui `coding-v2-documents`; o banco antigo `coding-db` não deve ser aberto para escrita.
- Preserve o funcionamento dos 16 aplicativos, links existentes, importações, impressões, a identidade CD · Negativo, a PWA e a retomada de sessão.
- Não remova `coding-v2/public/vendor/`, `coding-v2/public/legacy-icons/` ou recursos internos por terem nomes antigos: ainda podem ser usados pela aplicação atual.
- O código antigo continua no **histórico Git**. Excluir arquivos da árvore atual não remove esse histórico nem dados dos navegadores.

Para testes, capturas, documentação e fluxo de PR, siga `coding-v2/DESENVOLVIMENTO.md`.
