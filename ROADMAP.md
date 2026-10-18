# Roadmap do Coding

Lista de pedidos pendentes. Quando o dono do projeto mandar **"Iniciar update"**, o Claude implementa tudo o que está em **Próximo update**, testa, atualiza o README e envia para a `main`. Depois move os itens concluídos para **Feito**.

## Próximo update

### Layout separado para PC e celular (aprovado: barra lateral no PC)
- **Estrutura:** dois modos principais (Etiquetas e Textos) sempre em destaque; as ferramentas secundárias ficam num grupo "Ferramentas", fora do caminho.
- **PC:** barra lateral fixa à esquerda com Início, Etiquetas, Textos e Ferramentas (expande a lista). Dentro de um documento a barra encolhe para só ícones e o editor ganha espaço.
- **Celular:** sem barra lateral; barra fixa embaixo com Início, Novo (+), Ferramentas e Menu. O "+" abre uma folha por baixo com as opções de criar. Controles do editor em faixa rolável com botões grandes.
- **Facilidade:** botões sempre com ícone e nome, no máximo 4 destinos principais, uma ação de destaque por tela, nada escondido.

### Ferramentas secundárias (a escolher)
Códigos QR e de barras em folha A4; importar planilha/CSV nas Etiquetas (uma etiqueta por linha); PDF (anotar, assinar, juntar, dividir, reordenar); Imagens (redimensionar, cortar, comprimir, montar em A4); Recibos/Orçamentos; Planilhas simples; Checklists; Placas/Cartazes; Digitalizar documento pela câmera.

### Ainda fora do Texts (fica para depois)
Tabelas, exportar para `.docx`, cabeçalho/rodapé, comentários, corretor ortográfico próprio (o do navegador continua valendo), recortar e girar imagem, imagem solta sobre o texto (posição livre) e imagem de fundo.

## Ideias ainda não aprovadas
- Salvar modelos próprios (por exemplo "meu padrão" com fontes e tamanhos).
- Duplicar documento na tela inicial.
- Tamanhos de etiqueta fixos (por exemplo 10 × 5 cm).
- Contador "faltam X etiquetas" para completar a última folha.

## Feito
- Vários itens por documento, colar lista, 1 a 3 colunas, linha de corte.
- Retrato e paisagem, zoom que mostra a página inteira, editor recolhível.
- Tela inicial (Continuar editando / Criar um novo) e biblioteca de documentos.
- PWA instalável e offline.
- Links diretos (`#/novo`, `#/continuar`, `#/doc/…`) e link de compartilhamento.
- **Modos Etiquetas e Texts**, com a escolha na tela inicial, ícone por tipo na biblioteca e links `#/novo/etiquetas` e `#/novo/texts` (`#/novo` continua sendo Etiquetas).
- **Coding Texts**: folha A4 retrato/paisagem, negrito, itálico, sublinhado, fonte, tamanho, cor, alinhamento e justificado, títulos 1 e 2, listas, desfazer/refazer, colar sem formatação, contador de palavras e páginas, marcas de fim de página, impressão/PDF.
- **Imagens no Texts**: inserir por arquivo, galeria/câmera, Ctrl+V ou arrastando; alças e barra (largura, alinhamento, substituir, remover); redução para 1600 px; quadro "Imagem indisponível" com botão Substituir; limite de 30 imagens.
- **Biblioteca em IndexedDB**, com migração automática dos documentos antigos e reserva em `localStorage`; `.json` leva as imagens, o link de compartilhamento não.
- **Menu de clique direito** com atalhos por contexto, toque longo, teclado e acessibilidade; atalhos Ctrl+P, Ctrl+S, Alt+N, Alt+H e `?`.
- **Tela de carregamento** inline, sem flash de CSS, com aviso e "Tentar de novo" após 8 s.
