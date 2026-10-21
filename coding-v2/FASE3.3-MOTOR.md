# Coding Launcher 2.0 — Fase 3.3: robustez do armazenamento

Branch: `coding-v2`. Escopo: motor e testes. `main`, deploy e o banco legado `coding-db` **não foram alterados**.

## Correções implementadas

1. **Base64 em tempo linear** em `src/storage/archive.ts`: a regex recursiva foi substituída por validação de comprimento, alfabeto e padding em laço. Detecta arquivo acima do limite *antes* de chamar `atob`. O formato binário do backup v1 e v2 não mudou.
2. **Testes de 3, 10 e 32 MiB** para exportar e restaurar blobs reais. Um teste adicional do Chromium passa pelo upload do backup experimental v1, pela biblioteca e pela exportação no formato v2. O projeto ainda limita backups JSON a 64 MiB e anexos novos a 32 MiB. *Não* promete aceitar backups históricos acima desses limites.
3. **`saveCopyRevision` devolve a revisão realmente confirmada**, usando o resultado da mesma transação `readwrite` e os anexos lidos nela, em vez de fazer uma segunda leitura que poderia capturar uma gravação mais recente de outra aba.
4. **Conexões bloqueadas**: ao expirar a abertura do IndexedDB v2, uma eventual conexão que abrir tardiamente é fechada de imediato, evitando vazamento.
5. **`listCopySummaries()`**: API só de metadados que lê chaves dos anexos, mas não os blobs. Inclui contagem de imagens e tamanho quando registrado; arquivos criados na Fase 3.1 podem ter tamanho `null` até serem regravados ou migrados. A biblioteca Vue atual **ainda usa `listCopies()`**, portanto o ganho de desempenho na UI só virá após integração pelo Claude.
6. **`importLegacySnapshotsAtomic()`**: importa um conjunto selecionado de snapshots do Coding antigo numa única transação com controle de duplicações. O assistente atual ainda grava cada item separadamente, por escolha da Fase 3.2; a UI precisa ser conectada a essa API numa atualização posterior.
7. **`estimateStorage()` / `requestPersistentStorage()`**: APIs para indicadores de quota estimada e pedido explícito de armazenamento persistente. O segundo método deve ser chamado apenas após ação do usuário. Estimativas são do domínio inteiro e não indicam espaço físico exato.

## Testes e cautelas

- Testes com blobs grandes e arquivo base64 malformado.
- Teste Chromium de atualização do banco de cópias v1 para v2, preservando imagens embutidas e transferindo-as para o object store `assets` ao renomear.
- Regressões legadas e da biblioteca precisam continuar aprovadas pelo GitHub Actions.
- Antes de habilitar os motores reais, falta planejar escrita incremental de anexos, migração do formato `.coding.json`, estratégia para arquivos >32 MiB e restauração seletiva quando um backup tem duplicatas.
- A soma SHA-256 serve para detectar corrupção acidental, **não** para autenticar a origem de um backup.
- A origem do navegador importa: uma v2 em outro domínio ou app isolado não acessa automaticamente o armazenamento do Coding atual.
- Ainda faltam testes em aparelhos físicos, Safari/iOS, Firefox e simulação de quota excedida.

## Integração seguinte, sugerida ao Claude

- Usar `listCopySummaries()` na lista principal, mantendo `getCopy(id)` para exportação, detalhes ou duplicação.
- Usar `importLegacySnapshotsAtomic()` como opção tudo-ou-nada no assistente, com resumo de conflitos antes da confirmação.
- Apresentar `estimateStorage()` e permitir `requestPersistentStorage()` somente por interação explícita.
- Revisar mensagens de erro desatualizadas sobre base64 acima de 3 MiB, antes de afirmar que o limite crítico foi resolvido no navegador.
