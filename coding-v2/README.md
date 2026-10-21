# Coding Launcher 2.0 · Fundação experimental

Esta pasta contém uma **nova base isolada**, em Vue 3 + TypeScript + Vite multipágina + Pinia + Tailwind CSS 4. **A aplicação legada na raiz do repositório está preservada.**

## Rodar localmente

Pré-requisito: Node.js 20.19+ ou 22.12+ e acesso ao npm.

```bash
cd coding-v2
npm install
npm run test:structure
npm run typecheck
npm run build
npm run dev
```

Endereços locais:
- `/launcher/`: central de aplicativos
- `/apps/etiquetas/`: casca isolada de Etiquetas
- `/apps/texto/`: casca isolada de Texto

O Vite usa múltiplos arquivos HTML. A pasta `dist` só será produzida depois de instalar dependências e compilar.

## O que já funciona nesta etapa

- Catálogo dos nove aplicativos com ícones SVG coloridos e identificadores estáveis.
- Somente Etiquetas e Texto ativados por padrão.
- Ativar/desativar atalhos das duas entradas beta e persistir essa preferência em `coding-v2-apps`, sem tocar no banco antigo.
- Buscar apps, trocar telas, alternar temas e abrir páginas individuais.
- UI adaptada a telas pequenas e desktop.
- Teste estrutural usando apenas Node.js.

## O que NÃO está implementado

- Editores completos, importação, exportação e gravação de documentos **não foram portados**. As folhas dos apps são apenas exemplos visuais.
- **Nenhuma PWA está instalável nesta etapa:** não há manifests nem service worker nesta base. Isso é intencional até validar multi-PWA, escopos e armazenamento nos navegadores.
- Não foi implementado download seletivo de módulos nem status real de offline.
- Não há integração nem migração com o IndexedDB antigo `coding-db`.
- Não há redirecionamento para este projeto a partir da aplicação legada, e nenhum deploy foi realizado.

## Proteção de dados

Não criar um novo banco com o nome `coding-db` durante a fase de testes; primeiro escrever testes de importação/backup e de conflitos. O protótipo **nunca** apresenta um rótulo `Salvo` para dados que não gravou.

## Publicação futura

O `index.html` da nova base faz redirecionamento interno para `/launcher/` **somente quando `coding-v2` for configurada como raiz do projeto Vercel**. Não aponte o projeto Vercel atual para esta pasta antes de concluir a migração.

## Próximo passo sugerido

Criar um pacote de testes de compatibilidade do IndexedDB antigo, um adaptador com salvamento transacional, e uma prova de conceito real de PWAs separados com dados compartilhados. Depois migrar os motores originais de Etiquetas e Texto sem regressões.
