# Fase 3.4 — Biblioteca integrada ao motor da Fase 3.3

Interface (Claude). `src/storage/documents.ts` e `archive.ts` não foram alterados.

## O que mudou
- **Lista leve:** a biblioteca usa `listCopySummaries()`. Os blobs só são lidos por `getCopy(id)` ao exportar (uma cópia por vez no backup geral). Provado em e2e contando leituras do store `assets`: listar e abrir detalhes = 0 leituras.
- **Importação em lote:** o passo "Confirmar" usa `importLegacySnapshotsAtomic` (tudo ou nada), mostra o tamanho das imagens e avisa se passam de 80% do espaço livre estimado. Itens com cópia existente ou com identificador repetido no Coding antigo aparecem indisponíveis. Corrida entre abas: o lote falha inteiro e a tela diz que nenhuma cópia foi criada (e2e com duas abas).
- **Espaço:** painel com uso e cota estimados do site inteiro (com a ressalva de que não é espaço livre) e botão "Pedir armazenamento persistente", acionado só por clique. Negação é apresentada como texto, com orientação de exportar backups.
- **Mensagens:** removida a mensagem obsoleta sobre base64; limites reais de 32 MB por imagem e 64 MB por backup, com sugestão de exportar cópia por cópia.

## Pendências do motor (GPT-6)
1. Cópias podem ser criadas com imagens acima de 32 MB ou somando mais de ~47 MB, mas não podem ser exportadas (confirmado na auditoria 3.3). Recusar na criação ou permitir backup em partes.
2. Resumo persistido por cópia: `listCopySummaries` ainda lê `snapshot.doc` inteiro (e blobs de cópias v1 não migradas).
3. `importLegacySnapshotsAtomic` devolve só a contagem; ids criados e lista de conflitos permitiriam selecionar o resultado e explicar duplicatas.
4. `requestPersistentStorage` devolve só booleano (não distingue "negado" de "sem suporte"); as APIs de cota não tratam exceções.
5. Testes das APIs novas no motor, com dados aleatórios + SHA-256, e medição de memória/tempo de 32 MiB no navegador.

## Limitações
- Sem teste em Safari/iOS/Firefox nem em aparelho real. Sem PWA/offline.
