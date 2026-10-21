# Coding 2.0 · Contratos técnicos (rascunho)

## Objetivo
Migrar a suíte existente sem perda de funcionalidade, respeitando o planejamento de UI/UX anexado pelo proprietário (24 páginas). **Esta fase só implementa a fundação.**

### Topologia
- Uma origem inicialmente; entradas `/launcher/`, `/apps/etiquetas/`, `/apps/texto/`.
- Um shell compartilhado em `src/`, com Vue SFC, Pinia e CSS/tokens.
- Outros sete apps constam do catálogo, mas ficam indisponíveis na v2 até que sejam migrados.
- Manifests e service workers individuais ficam para um experimento posterior. Não confundir `ativado` com `offline` ou `instalado no sistema`.

### Persistência
O legado usa IndexedDB `coding-db` versão 1, com object stores `docs` (keyPath id), `meta`, `images` (índice docId); há fallback em localStorage. Não mudar a versão do DB existente sem estratégia de rollback. Construir primeiro fixture de banco legado, exportação de segurança, snapshot e restauração.

Proposta de motor de escrita (ainda não implementada):
1. Documento com `revision` e `updatedAt`, e fila serializada por documento.
2. Uma transação de escrita inclui metadados e blobs de imagens pertinentes; feedback `Salvo` só após `tx.oncomplete`.
3. Antes de gravar, comparar revision persistida. Se diferente, bloquear overwrite e oferecer cópia.
4. Usar BroadcastChannel para avisos entre abas; não tratar BroadcastChannel como fonte de verdade.
5. Ao fechar, recarregar, alternar documentos ou migrar, aguardar flush ou oferecer recuperação.
6. Evitar exclusão automática silenciosa ao atingir 30 documentos; avisar quota e oferecer exportação.
7. Cobrir migração de documentos dos nove tipos, inclusive PDFs, planilhas e imagens, e fallback localStorage.

### Offline / PWA
A ativação é uma preferência interna. Disponibilidade offline deve exigir lista de assets da versão compilada, download completo e verificação real. Instalação PWA no dispositivo é um fluxo separado, condicionado ao suporte do navegador. Testar Windows Edge/Chrome, Android Chrome e Safari iOS, inclusive dois apps instalados da mesma origem. Não garantir compartilhamento de dados no iOS antes de comprovar.

### QA e desempenho
- Testar build real no CI.
- Rodar regressões do legado, manter a main intacta.
- Testar viewport móvel 320/360/390/430, tablet e desktop.
- Medir tempo de inicialização e tamanho de cada pacote após build.
- Requer aprovação do proprietário antes de merge e deploy.
