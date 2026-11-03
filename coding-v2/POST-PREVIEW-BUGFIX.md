# Coding 2.0 · Pendências para a rodada de correções e polimento

Lista honesta do que ficou de fora ou precisa de revisão depois da Prévia completa. Nada aqui envolve perda de dados conhecida.

## Recursos ainda não implementados
- **Offline / PWA**: infraestrutura experimental de cache estático implementada e testada no CI Chromium, mas **desativada por padrão**; precisa de build opt-in (`VITE_CODING_PREVIEW_PWA=1`) e domínio exclusivo de Preview. Instalação real no celular, Safari/iOS e atualizações em produção ainda não verificadas.
- **Documentos antigos do Coding 1.0**: os sete apps novos têm “Converter e abrir” (cria documento novo; o original não muda). Conversões aproximadas: em Imagens do 1.0, molduras, balões, adesivos de imagem e alguns filtros não são convertidos; no Editor PDF do 1.0, anotações de imagem (assinaturas) não são convertidas e “cobrir” vira retângulo.
- Texto: cabeçalho/rodapé, comentários, células mescladas, numeração de páginas no PDF.
- Planilhas: gráficos, filtros por coluna, mesclar células, séries automáticas (1, 2, 3…), colar fórmulas ajustando referências, ler formatos/estilos do XLSX importado, `.xls` antigo.
- Imagens: pincel/borracha, remover fundo, recorte arrastando na tela, edição de texto direto na tela, zoom por pinça.
- Editor PDF: assinatura, formulários, editar texto existente; anotações só com a fonte Helvetica (caracteres fora do Latin-1 viram “?”).
- QR / Barras: Data Matrix, PDF417, geração em lote a partir de planilha, PDF direto (hoje via “Salvar como PDF” na impressão).
- Sorteio: pesos; exportar resultado como imagem. Racha-conta: várias moedas e compartilhamento por link.

## Limitações conhecidas
- PDF do Texto é gerado como imagem das folhas (texto não selecionável); blocos maiores que uma folha são divididos em fatias visuais, podendo interromper uma linha entre páginas. “Imprimir → Salvar como PDF” mantém texto selecionável.
- DOCX do Texto: imagens sempre na linha (sem texto ao lado), listas aninhadas viram uma lista simples.
- Etiquetas (e Planilha→Etiquetas): limites do motor atual — 200 itens, 500 cópias por item, 2.000 etiquetas por documento.
- Planilhas: até 1.000 linhas × 52 colunas × 20 abas por documento; em fórmulas com “;” a vírgula é decimal, sem “;” a vírgula separa argumentos.
- Prévias da Biblioteca para Imagens e PDF são resumos (tamanho, camadas, páginas): para não ler Blobs, não há miniatura em pixels.
- Filtros de imagem no Safari antigo (sem `ctx.filter`) usam ajuste por pixel; desfoque e matiz não são aplicados nesse caso.
- Testes automatizados só em Chromium. Safari/iOS, Firefox e teclados virtuais reais não foram exercitados.
- Sem capturas de tela no PR (o ambiente de desenvolvimento não tem acesso a um navegador visível nem ao deploy de prévia).

## Polimento visual a revisar
- Etiquetas e Texto mantêm a casca própria (mesmo princípio de topo/embaixo), não a `EditorShell` comum.
- Barras de ferramentas longas no celular (Texto, Imagens) rolam bastante; agrupar melhor.
- Ícones das camadas de Imagens já usam SVG; ainda há símbolos textuais nas ações de tabela do Texto, a substituir.
- Roleta com muitos nomes (> 60) fica com rótulos pequenos.
- Revisar espaçamentos dos painéis em 600–899 px.
