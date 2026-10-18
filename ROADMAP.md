# Roadmap do Coding

Lista de pedidos pendentes. Quando o dono do projeto mandar **"Iniciar update"**, o Claude implementa tudo o que está em **Próximo update**, testa, atualiza o README e envia para a `main`. Depois move os itens concluídos para **Feito**.

## Próximo update

### Modos do app
O Coding passa a ter modos. A tela inicial deixa escolher o tipo ao criar um documento, e a biblioteca guarda os dois tipos juntos.

- **Etiquetas**: o que existe hoje, sem mudanças.
- **Texts**: editor de texto básico, tipo um Word enxuto.

Regras gerais:
- Cada documento guarda o seu `type` (`labels` ou `texts`). Documentos antigos viram `labels`.
- A biblioteca mostra os dois tipos, com ícone para diferenciar.
- Links: `#/novo/texts` e `#/novo/etiquetas` (`#/novo` continua criando Etiquetas).
- O botão Link, o PWA, o salvamento, a exportação `.json` e o modo offline funcionam nos dois tipos.

### Coding Texts, primeira versão (só o essencial)
- Folha A4 em retrato ou paisagem, com margens, e impressão/PDF.
- Formatação: negrito, itálico, sublinhado, fonte, tamanho, cor do texto e alinhamento (esquerda, centro, direita, justificado).
- Títulos (1 e 2) e listas (com marcadores e numeradas).
- Desfazer e refazer; atalhos Ctrl+B / I / U / Z / Y.
- Colar texto sem trazer formatação estranha.
- Contador de palavras e de páginas na barra inferior.
- Marcação visual de onde cada página termina (a folha é contínua ao editar; no PDF as quebras seguem o A4).
- Salvamento automático na biblioteca, nome do documento editável.
- Mesmo layout responsivo do app (celular, tablet, computador).

### Fora da primeira versão (fica para depois)
Tabelas, imagens, exportar para `.docx`, cabeçalho/rodapé, comentários, corretor ortográfico próprio (o do navegador continua valendo).

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
