# Relatório de testes — Coding v28 (auditoria de 18/10)

Tudo abaixo foi **executado de verdade num navegador (Chromium/Playwright)** contra a versão publicada em `main`.
Só está como PASSOU o que rodou e conferiu o resultado. O que não foi testado está na seção "Não testado".

## Resultado

| # | Fase | Verificação | Resultado |
|---|------|-------------|-----------|
| 1 | 1 | Rascunho não vai para a biblioteca: 0 documentos salvos ao abrir/criar cada um dos 9 tipos | PASSOU |
| 2 | 1 | Abrir todos os documentos salvos não regrava nada (0 gravações, datas iguais) | PASSOU |
| 3 | 1 | Editar de verdade grava (1 documento depois da edição) e continua após recarregar | PASSOU |
| 4 | 1 | Trocar de aba (preferência de tela) não promove rascunho nem muda a data | PASSOU |
| 5 | 1 | Exportar → importar os 9 tipos (backups v2, v3 e v4; v4 de Imagens/Sorteio/Racha aceito) | PASSOU |
| 6 | 1 | Limite de 30: ao salvar o 31º sai só o mais antigo **sem estrela** (“Doc 2”), com aviso | PASSOU |
| 7 | 1 | Favoritos nunca são apagados sozinhos; com 30 favoritos o novo não salva e mostra “Não salvo: biblioteca cheia de favoritos” | PASSOU |
| 8 | 1 | Imagens: confirmação antes de trocar a foto/abrir tela em branco quando há edição; Cancelar mantém a foto | PASSOU |
| 9 | 2 | Filtros: P&B → Sépia troca (não empilha); “Normal” volta ao pixel original | PASSOU |
| 10 | 2 | Intensidade (Sépia 50%) correta, igual depois de recarregar; desfazer; “Voltar à foto original” | PASSOU |
| 11 | 2 | XLSX: células mantêm a posição (A1, A3, C3, B5) com linhas vazias no meio | PASSOU |
| 12 | 2 | Racha-conta: 10÷3 = 3,34 + 3,33 + 3,33; gorjeta; `1.234,56`, `R$ 1.234,56`, `1.234`, `12.5` lidos certo; `abc` e `1,234,5` recusados | PASSOU |
| 13 | 2 | Racha por itens: item sem ninguém marcado gera aviso e botão “Dividir entre todos” | PASSOU |
| 14 | 2 | PDF: botão “Cobrir visualmente” com aviso de que o texto continua no arquivo | PASSOU |
| 15 | 3 | Relógio: opção “Horário do aparelho (local)” existe, Brasília é o padrão, a escolha é lembrada | PASSOU |
| 16 | 3 | Relógio local com aparelho em Tóquio: 10:52 local × 22:52 Brasília | PASSOU |
| 17 | 3 | Nenhum emoji nos controles (só os adesivos de Imagens, que são conteúdo) | PASSOU |
| 18 | 3 | Planilha → Etiquetas: digitar à mão, adicionar/apagar linha, contador, sobrevive ao recarregar, cria o documento de Etiquetas | PASSOU |
| 19 | 4 | Sem rolagem horizontal em 11 telas × 6 larguras (320, 375, 768, 1024, 1440, 1920) = 66 combinações | PASSOU (66/66) |
| 20 | 4 | PDF no cache do app (`pdf.min.js`, `pdf.worker.min.js`, `pdf-lib.min.js`) | PASSOU |
| 21 | 4 | **Sem internet**, o editor de PDF abre um PDF e mostra as 5 miniaturas | PASSOU |
| 22 | 4 | Todo botão/campo tem nome acessível nas 8 telas principais | PASSOU |
| 23 | 4 | Manifest válido e com descrição atual | PASSOU |
| 24 | 5 | Regressão geral (9 rotas, calculadora, imagens, sorteio, racha) sem erros no console | PASSOU |
| 25 | 5 | Site publicado (codingtxt.vercel.app) serve `sw.js` com `CACHE_VERSION = 27` e os arquivos do PDF no cache | PASSOU |

Reprodução parcial: `python3 tests/final.py` (com a pasta servida em `http://localhost:8766`) refaz os itens 15, 17, 18, 20–24 e imprime PASSOU/FALHOU (12/12).

### Fase 6 (extras)

| # | Verificação | Resultado |
|---|-------------|-----------|
| 26 | Renomear 1 documento na seleção | PASSOU |
| 27 | Duplicar 3 documentos → 6, com “(cópia)” no nome, sem abrir nenhum | PASSOU |
| 28 | Backup da biblioteca (6 docs) → apagar tudo → restaurar → 6 docs, continua após recarregar | PASSOU |
| 29 | JPG de PNG transparente com fundo vermelho: canto vermelho, centro azul preservado; seletor some em PNG | PASSOU |
| 30 | Barra de seleção sem overflow a 320 e 375 px; regressão geral e `tests/final.py` 12/12 | PASSOU |

## Não testado (sem maquiagem)

- **Celular de verdade** (toque, teclado virtual, câmera): só simulei telas pequenas no navegador.
- **Armazenamento cheio** (quota do navegador estourada): o aviso “Não foi possível salvar” existe, mas não provoquei a falha.
- **Recuperar** o documento mais antigo apagado automaticamente: hoje ele é apagado de vez (com aviso); não há “desfazer”.
- Safari/iOS e Firefox: só Chromium.
- Impressão física de Etiquetas.

## Pendências conhecidas (fora do plano, Fase 6 só com aprovação)

Feitas na Fase 6. Restam ideias futuras, como desfazer a exclusão automática do mais antigo.
