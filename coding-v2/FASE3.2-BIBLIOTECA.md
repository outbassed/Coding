# Fase 3.2 — Biblioteca de documentos (interface)

Responsável: Claude (interface). Armazenamento: GPT-6 Alta (`src/storage/documents.ts` e `archive.ts` **não foram alterados**).

## O que a interface faz
- **Minhas cópias** em primeiro lugar: busca por nome (sem distinção de acento/caixa), filtros por ferramenta e origem, ordenação por atualização e por nome. Filtros ficam na URL (`?busca=&ferramenta=&origem=&ordem=`).
- Cartões com ícone SVG colorido da ferramenta, tipo, origem, data e quantidade de imagens. Lista progressiva (24 por vez; o foco vai ao primeiro item novo).
- Computador: lista + painel de detalhes. Celular (desde 320 px): gaveta inferior com os detalhes, filtros recolhíveis, alvos ≥ 44 px, campos com 16 px.
- **Importar do Coding antigo** em 3 passos (examinar → selecionar → confirmar). Usa `inspectLegacy` (somente leitura) e `createCopy`, um documento por vez, com relatório individual. Documentos que já têm cópia aparecem como indisponíveis.
- **Conflito A1 corrigido**: a revisão esperada é capturada ao abrir "Renomear" e nunca é trocada quando a lista atualiza. Em conflito a interface mostra o nome digitado e o da outra janela e oferece: cancelar (nada é gravado), atualizar, ou salvar como nova cópia (`forkCopy`).
- Ações: renomear, exportar (backup verificado de uma cópia), criar cópia (`forkCopy`), excluir (`deleteCopy`, com confirmação dizendo que o Coding antigo não é afetado; recusa se a revisão mudou).
- Acessibilidade: regiões `status`/`alert` sempre presentes, foco movido/devolvido nos diálogos, erros em português, movimento reduzido, axe nos estados principais.

## Validação de `forkCopy` e `deleteCopy`
Não tinham testes no motor. Foram validados em e2e (`e2e/library.spec.ts`): bytes das imagens preservados na nova cópia e nos assets, revisão 1 na cópia nova, exclusão remove os assets, exclusão com revisão defasada é recusada sem apagar nada.

## O que depende do GPT-6 Alta
1. **C1 (crítico)**: o regex base64 de `archive.ts` estoura a pilha acima de ~3,25 MB; exportar e importar anexos grandes falha. A UI mostra mensagem em português ("anexo grande demais… limitação conhecida"), mas o conserto é do motor.
2. `saveCopyRevision` deve devolver o registro realmente gravado (hoje relê depois do commit).
3. Listagem leve: `listCopies()` carrega todos os blobs. Pedido: `listCopySummaries()` sem blobs (id, label, revision, datas, tipo, origem, nº e tamanho das imagens) e `getCopy` sob demanda.
4. Cota: `estimateStorage()` / aviso antes de gravar, para a UI avisar antes de falhar (hoje só traduz `QuotaExceededError`).
5. Importação em lote atômica exposta para snapshots do legado (hoje o assistente grava um a um e informa o resultado de cada).
6. Nome de erro estável (`name`) em todas as classes de erro do motor; a UI mapeia por `name`.

## Limitações conhecidas
- Os editores ainda não abrem as cópias (fora do escopo); a biblioteca não tem "Abrir".
- Exportar uma cópia usa o mesmo formato de backup v2 e herda o limite C1.
- Sem PWA/offline nesta fase.
