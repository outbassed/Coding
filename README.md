# Coding

Editor pessoal de documentos A4 para códigos e descrições de produtos, com paginação automática.

## Como usar
1. Abra index.html no navegador ou publique o repositório pelo GitHub Pages.
2. Na aba Código, informe o código e ajuste fonte, tamanho, negrito, itálico e alinhamento.
3. Na aba Descrição, preencha a descrição (inclusive em várias linhas) e formate de modo independente.
4. Na aba Repetir, escolha entre 1 e 500 repetições.
5. Na aba Página, configure o espaçamento entre os blocos.
6. Clique em **Imprimir / PDF**. Para um PDF, escolha **Salvar como PDF** na janela de impressão.

O conteúdo é distribuído em folhas A4 retrato, com margens de 15 mm nas extremidades superior/inferior e 14 mm nas laterais. Código e descrição fazem parte de um bloco indivisível: se não couberem juntos na página atual, o bloco começa na próxima. Se até mesmo um único bloco ultrapassar a altura útil de uma folha, o aplicativo avisa e desativa a impressão até você ajustar o conteúdo.

## Recursos
- Visualização de página em escala e zoom
- Barra de ferramentas em cima no desktop e painel inferior no celular
- Ajustes independentes para código e descrição: fonte, tamanho (8–96 pt), negrito, itálico e alinhamento
- Repetições automáticas e páginas extras
- Salvamento automático no armazenamento local do navegador
- Exportação/importação de projetos .coding.json
- Impressão/PDF via recurso nativo do navegador
- HTML, CSS e JavaScript puros, sem frameworks, backend ou contas

## Arquivos (todos na raiz)
- index.html: estrutura do editor
- style.css: layout responsivo e CSS de impressão A4
- script.js: controle dos formulários, paginação, prévia e persistência

## Observações
- Os projetos ficam salvos apenas neste navegador/dispositivo. Use Projeto para baixar um backup JSON.
- Para obter tamanho de papel fiel, imprima em A4, escala 100%, margens nenhuma, e desative cabeçalhos/rodapés na janela de impressão, caso o navegador ofereça essas opções.
- O botão de PDF abre a impressão do navegador, sem gerar PDF em segundo plano.
- Fontes disponíveis podem variar de acordo com o sistema operacional.
