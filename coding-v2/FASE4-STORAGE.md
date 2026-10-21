# Fase 4 · Motor de armazenamento paralelo a Etiquetas

**Branch:** `feature/storage-v2` (base `coding-v2` em `8cf4e90`). PR em rascunho, separado do PR #1 do Claude. Nenhum merge ou deploy na `main`.

## Entregas reais

- `Source` inclui **`v2`**, aceito por `validateSnapshot`, exportação assinada e validação de cópias. Valores históricos `indexeddb`, `localStorage` e `backup` continuam aceitos. IDs antigos `v2-labels-*` gravados com `backup` não são convertidos nem perdem acesso.
- `archive-pack.ts` fornece `encodeBinaryPackage(copies)`, `decodeBinaryPackage(blob)`, `importBinaryPackage(blob)` e `encodeSafeBackup(copies)`.
- O formato experimental **`.codingpack` NÃO é ZIP**. É um envelope versionado: assinatura de abertura, comprimento, manifesto JSON com o backup de metadados v2 **assinado**, seguido dos blobs originais sem base64. Cada bloco binário de 2 MiB possui SHA-256 e é verificado antes da importação atômica no banco.
- `encodeSafeBackup` mantém `.json` para backups pequenos e devolve `.codingpack` quando o backup JSON excederia seus limites: por exemplo, **uma imagem aleatória de 33 MiB** ou **duas de 25 MiB**. O formato existente JSON v1/v2 continua com suporte.
- As imagens são processadas por blocos (leitura e verificação); o resultado para download ainda é um `Blob`, e um app pode gravá-lo via URL de objeto ou seletor de arquivos. Não converte todos os bytes em uma string base64.
- Foram criados testes Vitest para os limites, corrupção, origens e compatibilidade, além de teste Playwright com armazenamento IndexedDB e pacote no Chromium.

## Integração do PR de Etiquetas (#1)

O PR #1 foi criado a partir da mesma base e **não foi modificado**. Depois de integrar ambos:

1. Trocar `NEW_DOC_SOURCE = 'backup'` por `NEW_DOC_SOURCE = 'v2'` em `src/labels/store.ts`, sem eliminar o tratamento de documentos antigos com prefixo `v2-labels-*`.
2. A biblioteca passa a poder filtrar pelo quarto valor de origem `v2`. A API do motor já aceita esse valor.
3. **Integrar na interface** `encodeSafeBackup` para exportar um documento e `importBinaryPackage` para importar arquivos `.codingpack`. Não anunciar suporte ao pacote binário na UI antes disso.
4. A importação do pacote chama `importCopiesAtomic` com proteção por ID e execução tudo-ou-nada. Deixar claro que a cópia já existente não será sobrescrita.
5. Para exportar com segurança, preferir `getCopy(id)` antes de chamar `encodeSafeBackup`, evitando carregar blobs na lista.

## Limites restantes

- O formato `.codingpack` é próprio do Coding, não é ZIP, e precisa de integração visual (a biblioteca atual ainda só exporta JSON).
- O manifesto JSON é limitado a 64 MiB. Blobs muito grandes ainda dependem dos limites práticos do navegador e da memória disponível.
- SHA-256 detecta corrupção acidental; não garante autoria, assinatura digital ou segurança contra uma pessoa que constrói outro pacote com hashes válidos.
- Não foi realizado teste em Safari/iOS ou Firefox nem com dispositivo físico. A codificação é assíncrona, mas o cálculo dos hashes ainda utiliza CPU.
- Testar importação e exportação reais pelo seletor de arquivos na UI depois da integração. A `main` e `coding-db` não foram tocados.
