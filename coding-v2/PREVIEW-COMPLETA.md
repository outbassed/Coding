# Coding 2.0 · Prévia completa — funcionalidades por app

Legenda: ✅ implementado e coberto por teste automatizado · ☑️ implementado, sem teste automatizado próprio · ⏳ pendente (ver POST-PREVIEW-BUGFIX.md)

Todos os apps: modelos editáveis (abrir e experimentar sem enviar arquivo) ✅ · salvamento automático na Biblioteca só após alteração ✅ · proteção contra conflito de revisão (salvar como nova cópia / reabrir) ☑️ · desfazer/refazer e Ctrl+S ✅ · reabrir pela Biblioteca ✅ · casca responsiva (topo no computador, ferramentas embaixo no celular, teclado virtual e áreas seguras) ✅ · temas claro/escuro/automático ✅.

## Etiquetas
- Editor de itens (código, descrição, cópias), folha A4 ao vivo, retrato/paisagem, colunas, espaçamento e tipografia ✅
- Modelos de documento (5) e predefinições de layout aplicáveis sem perder os itens ✅
- Importação de CSV e XLSX com escolha das colunas de código, descrição e quantidade, validação linha a linha, acrescentar ou substituir ✅
- Colar lista de itens com prévia ✅ · Imprimir e baixar PDF ✅ · compatibilidade com documentos existentes ✅

## Texto
- Fontes, tamanhos, cores, destaque, títulos, alinhamento, listas, parágrafos ✅
- Tabelas: inserir, linha acima/abaixo, coluna à esquerda/direita, excluir linha/coluna/tabela ✅
- Imagens: inserir, redimensionar (botões e alça), posição (na linha, esquerda, centro, direita) ☑️
- Desfazer/refazer e atalhos ✅ · quebra de página e contagem de folhas A4 ✅
- Modelos: carta, relatório, ata, em branco ✅
- Exportar HTML e TXT ✅ · DOCX ✅ · PDF (folhas A4 em imagem) ✅ · imprimir ☑️
- Salvamento automático e proteção de conflito ✅ · teclado virtual no celular ✅

## Planilhas
- Grade editável com seleção, teclado (setas, Tab, Enter, F2, Delete), barra de fórmulas, copiar/colar ✅/☑️
- Várias abas (criar, renomear com atualização de referências, duplicar, excluir) ✅
- Fórmulas: referências, intervalos, outras abas, + − × ÷ ^ & %, comparações, SOMA, MÉDIA, MÍNIMO, MÁXIMO, CONT.NÚM, CONT.VALORES, ARRED, SE, E, OU, NÃO, ABS, INT, MOD, POTÊNCIA, RAIZ, PRODUTO, CONCATENAR, SOMASE, CONT.SE, MÉDIASE, SEERRO e outras; nomes em inglês também ✅
- Erros #DIV/0!, #REF!, #NOME?, #VALOR!, #CIRC! ✅ · inserir/excluir linhas e colunas ajusta fórmulas ✅
- Formatos: número, inteiro, moeda (R$), porcentagem, texto; negrito; alinhamento; largura de coluna ☑️
- Importar CSV/XLSX (novas abas) ✅ · exportar XLSX (todas as abas, com fórmulas) ✅ e CSV ☑️ · imprimir ☑️
- Modelos: orçamento do mês, tabela de produtos, em branco ✅

## Imagens
- Importar PNG/JPG/WebP como camadas ✅ · camadas de texto, retângulo e elipse ✅
- Ordenar, ocultar, duplicar e excluir camadas ☑️ · mover/redimensionar/girar por arraste ☑️ e por números ☑️
- Recortar, espelhar ✅, girar 90° ☑️, tamanho da tela e tamanhos prontos ☑️
- Filtros: brilho, contraste, saturação, P&B, sépia, matiz, desfoque e predefinições ✅
- Zoom ☑️ · desfazer/refazer ✅ · exportar PNG ✅, JPG ✅, WebP ☑️ · composição de exemplo ✅

## Editor PDF
- Abrir PDFs, miniaturas e navegação ✅ · PDF de exemplo gerado na hora ✅
- Juntar PDFs ☑️ · reordenar ☑️ · girar ✅ · duplicar ✅ · remover ☑️
- Extrair páginas marcadas ou intervalo ☑️ · dividir a cada N páginas (.zip) ☑️
- Anotações de texto ✅, destaque e retângulo ☑️ · baixar PDF novo ✅ (original nunca alterado)
- Erros claros para arquivo inválido ✅ e PDF protegido ☑️

## QR / Barras
- QR code (UTF-8), Code 128, EAN-13, EAN-8, UPC-A, Code 39 ✅ (padrões conferidos com implementação de referência)
- Validação e dígito verificador ✅ · tamanho, cores, margem, legenda, correção do QR ☑️
- Baixar PNG e SVG ✅ · folha A4 com cópias para imprimir ☑️ · modelos (exemplos, Wi‑Fi, produtos) ☑️

## Planilha → Etiquetas
- Planilha de exemplo editável ✅ · importar CSV ✅ e XLSX ☑️ · colar dados ☑️
- Escolha das colunas e quantidade padrão ✅ · validação linha a linha ✅
- Prévia com o motor de Etiquetas ✅ · gerar documento de Etiquetas ✅ · PDF e impressão ☑️

## Sorteio
- Roleta animada (respeita “reduzir movimento” do aparelho e dos Ajustes) ✅
- Não repetir quem já saiu e recomeçar ✅ · números (com/sem repetição) ✅ · dados ☑️ · equipes equilibradas ☑️
- Histórico salvo no documento e exportável ☑️ · modelos ☑️

## Racha-conta
- Pessoas e despesas ✅ · divisão igual ✅, por porcentagem ✅, por valores ☑️ (validação de soma ✅)
- Saldos e acertos sugeridos ✅ · cálculos em centavos inteiros ✅
- Resumo financeiro ✅ · exportar CSV ✅ e TXT ☑️ · imprimir ☑️ · modelos ✅

## Launcher, Biblioteca e Ajustes
- Nove apps reais no catálogo, com categorias, busca, filtros, ativação (sem confundir com instalação/offline) ✅
- Detalhes no estilo loja com recursos prontos ✅ · 3 colunas em 320–430 px ✅
- Biblioteca: abrir no app certo (documentos criados na v2), renomear, duplicar, excluir, grade/lista, busca, ordenação, paginação, histórico, prévias reais dos nove tipos ✅
- Backups JSON e .codingpack ✅ · datas originais preservadas na importação ✅ · miniaturas sem ler Blobs ✅
- Ajustes: tema, animações, exibição da biblioteca, espaço usado, documentos por app, situação do offline ☑️
- Uso offline/PWA ⏳ (não oferecido nesta prévia)
