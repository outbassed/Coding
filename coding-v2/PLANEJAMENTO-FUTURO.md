# Planejamento futuro

Ideias aprovadas para depois, **ainda não implementadas**. Este arquivo só registra a intenção; nada aqui altera o app atual, os documentos ou as configurações de quem usa o Coding.

## Navegar (em inglês: Coding Browser)

**Status:** planejado · pedido do dono em 01/11/2026 · não implementar agora.

### Ideia
Um aplicativo do Coding para abrir sites sem sair do Coding, com a possibilidade de **fixar sites em Meus apps**, de modo que cada site fixado apareça ali como se fosse um aplicativo (ícone, nome e um toque para abrir).

- Nome em português: **Navegar**. Nome em inglês: **Coding Browser**.
- Segue a filosofia dos demais editores: layout pensado para a função (barra de endereço, abas de navegação, favoritos), compartilhando a identidade visual e os componentes do Coding, inclusive no celular e no tablet.

### Escopo previsto (a definir antes de começar)
1. **Abrir endereços** digitados ou colados, com várias abas de navegação e histórico próprio.
2. **Fixar sites em Meus apps**: nome, endereço e ícone (o do site ou uma letra com cor); abrir, renomear e desafixar. Os sites fixados aparecem em Meus apps junto dos aplicativos instalados, claramente identificados como "site".
3. **Favoritos e recentes** dentro do Navegar.
4. **Offline**: o Navegar em si funciona offline (interface); os sites dependem de internet.

### Perguntas em aberto (decidir com o dono antes de implementar)
- **Limite técnico de incorporação:** muitos sites proíbem ser exibidos dentro de outra página (cabeçalhos `X-Frame-Options` e `Content-Security-Policy: frame-ancestors`). Um iframe não abre todos os sites. Alternativas: abrir em nova aba/janela do navegador para os sites que recusam, ou, em um app instalado (PWA/empacotado), usar uma visualização web nativa. Precisamos escolher a abordagem e avisar claramente quando um site não puder ser incorporado.
- **Privacidade e segurança:** sem coletar histórico fora do aparelho; histórico e fixados ficam só no aparelho; limpar tudo com um botão; só `https` por padrão e aviso para `http`; nada de sessões ou senhas guardadas pelo Coding.
- **Onde guardar os fixados:** em configurações do Launcher (nova chave, compatível com o que já está salvo), com teste de migração, sem tocar em projetos, documentos, backups nem no banco legado.
- **Meus apps hoje mostra só os aplicativos instalados para uso offline.** Os sites fixados exigirão uma seção ou etiqueta própria ali, sem confundir com a contagem de aplicativos instalados.
- Como **abrir um site fixado**: dentro do Navegar (rota própria) ou em nova aba; e se terá modo "janela sem barras" quando instalado.
- Se o Navegar entra no Catálogo como o 17º aplicativo e em qual categoria.

### Critérios de pronto (quando for implementado)
- Layout próprio testado em computador, tablet e celular (capturas e e2e), com acessibilidade verificada.
- Versão e compilação registradas na Central de Versões; testes de unidade e e2e (contextos limpos, sem dados reais); migração testada para a nova configuração de sites fixados.
- Nenhum documento, projeto ou configuração existente alterado; produção intacta.
