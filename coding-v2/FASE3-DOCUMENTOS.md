# Fase 3 · Ponte de documentos sem migração destrutiva

**Situação:** implementação experimental restrita a `coding-v2/`. A raiz legada e o banco `coding-db` não são alterados por esta ponte.

## O que existe
- Biblioteca na rota `/launcher/#/documentos`: consulta **sob demanda** do IndexedDB legado e da chave `coding-library-v1` do localStorage.
- A ponte verifica a existência do banco com `indexedDB.databases()` **antes** de abri-lo. Se a API de descoberta não existir, evita criar um banco legado por engano e explica a limitação ao usuário.
- O acesso ao banco legado é **somente leitura**, sem upgrade, exclusão ou migração silenciosa.
- Registros `docs` e `images` são associados por `docId`, preservando blobs originais.
- Backup JSON com conteúdo e imagens binárias em base64; exportação explícita dos itens listados (não promete incluir fontes inacessíveis).
- Cópias criadas explicitamente em novo banco `coding-v2-documents`, object store `copies`, sem limite fixo e sem exclusão automática.
- Cópia indivisível contém documento, imagens, origem, ID próprio e revision. Salvamento somente após `tx.oncomplete`.
- Alteração de nome da cópia demonstra o fluxo real de estados `pending → saving → saved/error`. O documento bruto importado fica preservado.
- Escrita com comparação de `revision` **na mesma transação readwrite**, evitando overwrite concorrente. `BroadcastChannel` avisa abas, mas a revisão do IndexedDB é a autoridade.
- Exportação/importação de backups gerados pela v2 cria *novas* cópias; não regrava o legado.

## Limites explícitos
1. **Motores dos editores NÃO foram migrados**. As cópias ainda não podem ser abertas/alteradas como documentos com formatação, e o botão Salvar do editor continua desativado.
2. A consulta só vê dados da **mesma origem de navegador** (mesmo protocolo/host/porta). Um deploy em outro domínio, uma instalação PWA com armazenamento isolado ou o localhost não enxerga automaticamente o banco do Coding atual.
3. A leitura de localStorage pode conter itens sem imagens binárias; o relatório na tela distingue sua fonte.
4. O backup do Coding 2.0 é um formato experimental próprio `coding-v2-safe-backup`, não substitui a compatibilidade de importação/exportação legada `.coding.json`.
5. O backup JSON salva os dados brutos originais e imagens. Mudanças apenas no **nome da cópia** e seu número de revisão não são exportadas no formato v1.
6. Limites de quota/privacidade continuam possíveis, e importar um arquivo grande pode gastar memória. A transação nunca informa `Salvo` antes do commit confirmado.
7. Importação de backup v2 é incremental por documento. Em caso de erro no meio, cópias anteriores permanecem, e a tela informa falha. Backup original não é apagado.
8. Nenhuma PWA ou cache offline foi habilitada nesta fase.
9. É necessário testar o backup e as imagens com arquivos reais, além dos fixtures de testes de navegador. Safari/iOS não foi validado.
10. A ponte não altera nem corrige bugs do motor de persistência da versão estável.

## Próximas tarefas
- Testar e integrar importação do formato `.coding.json` legado (versões 1–4).
- Anexar os motores reais de Etiquetas e Texto ao adaptador por tipos.
- Resolver edição, restauração e atualizações da v2, sem sobrescrever imagens.
- Ampliar testes cross-browser e casos extremos de armazenamento (quota e permissões).
- Posteriormente: distribuição offline e instalação PWA independente com testes reais.

**Critério de entrega:** `npm ci`, `npm run test:structure`, `npm run typecheck`, `npm run test:unit`, `npm run build` e `npm run test:e2e` verdes no CI. Nenhum merge na `main` ou deploy de produção.
