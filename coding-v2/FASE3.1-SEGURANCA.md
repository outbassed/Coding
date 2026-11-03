# Coding 2.0 · Fase 3.1: backups verificáveis (experimental)

Implementado na branch `coding-v2` em `coding-v2/`. **Nada é escrito no banco legado `coding-db`; a `main` e o site estável não foram alterados.**

## Alterações

- `coding-v2-documents` evoluiu da versão 1 para a 2 **sem apagar as cópias já salvas**. A nova store `assets` guarda blobs de imagens separados de metadados. Cópias antigas com imagens embutidas continuam legíveis, sendo migradas na próxima gravação daquela cópia.
- `importCopiesAtomic` valida as entradas e grava todas as cópias e imagens **numa única transação**. Falhas de quota ou duplicatas abortam o lote. Nenhuma importação parcial intencional.
- Duplicatas de ID e origem são recusadas por padrão; duplicar só é possível numa ação explicitamente autorizada (a API `forkCopy`, ainda sem UI).
- `saveCopyRevision` verifica a revisão dentro da própria transação de gravação; `BroadcastChannel` é somente um aviso.
- `deleteCopy` e `forkCopy` foram preparados em API, mas **não há botões para eles** até o UX de confirmação ser implementado.
- Nova exportação `coding-v2-safe-backup`, formato **versão 2**, com metadados `id`, `label`, `revision`, `source`, timestamps e blobs completos; soma SHA-256 por anexo e por entrada. Backup verificado novamente antes de solicitar download ao navegador.
- O leitor de backup ainda aceita a versão 1 experimental, quando o arquivo respeita seu formato. A versão 1 não possuía checksums nem metadados v2, que não podem ser reconstruídos retroativamente.
- A serialização v2 preserva `undefined`, não-finitos, `BigInt`, `Map`, `Set`, `Date`, `File`, `Blob`, `ArrayBuffer` e typed arrays conhecidos, inclusive `Uint8ClampedArray`. Objetos com protótipos não suportados falham explicitamente.
- Documentos inválidos e imagens órfãs encontrados durante a inspeção do legado são sinalizados; não são silenciosamente apresentados como incluídos no backup.
- Os downloads são iniciados pelo navegador; **não se pode confirmar programaticamente que o usuário guardou o arquivo em disco**.

## Limites e riscos restantes

1. **Fase experimental, não migração completa.** Etiquetas e Texto ainda não editam nem salvam documentos reais na v2. O formato `.coding.json` legado (versões 1–4) ainda não foi integrado.
2. Limite explícito por anexo de **32 MiB** e por backup JSON de **64 MiB**, aplicado para evitar travamentos em dispositivos móveis. Documentos maiores exigem outra estratégia, possivelmente exportação em streaming/ZIP.
3. Uma cópia v1 pode manter blobs embutidos até uma gravação. Os bancos de origem continuam no armazenamento do navegador, sujeitos à quota e à limpeza de dados.
4. Safari/iOS, Firefox e aparelhos físicos ainda precisam de testes; nenhum PWA/offline foi habilitado.
5. A biblioteca ainda precisa de uma tela própria de conflitos, exclusão com confirmação, foco e mensagens acessíveis. As APIs estão preparadas para o trabalho visual do Claude.
6. Não há garantia contra perda física por falha do dispositivo, limpeza de dados ou travamento do navegador. Exportar cópias externas continua sendo importante.
7. Proteger contra quota, importar formatos legados e tratar múltiplas abas em testes reais continuam em aberto.

## QA
- Testes unitários para roundtrip de blobs/typed arrays/metadados, checksums e dados malformados.
- Playwright: backups legados v1, importação atômica, recusa de duplicatas, armazenamento de blobs separado, exportação v2 e restauração isolada.
- As verificações de compilação e navegador devem passar no CI da branch, além das regressões da Fase 2.
