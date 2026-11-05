# Ícones da PWA: versionamento automático e atualização

## O problema
Depois da troca de identidade (Launcher 2.3.0), quem já tinha o Coding instalado continuou vendo a logo antiga. Causas encontradas no código:

1. **As páginas do Coding 2.0 não declaravam `<link rel="manifest">` em produção.** O manifesto só era ligado, por script, em ambientes de teste (`exposePreviewManifest` em `src/pwa.ts`). Os navegadores só reconferem nome e ícone de um app instalado lendo o manifesto da página que o app abre; sem o `<link>`, a logo nova nunca era vista.
2. **O `id` do manifesto mudou.** O Coding 1.0 tinha `"id": "./"`, que vale `https://codingtxt.vercel.app/`. O manifesto do 2.0 tinha `"id": "/launcher/"`. Para o navegador `id` diferente é *outro aplicativo*, e a atualização do instalado é ignorada. Agora o `id` é `"/"` e coincide com o do 1.0.
3. **Endereços fixos e cache.** Os ícones tinham sempre o mesmo endereço e o service worker (para quem instalou o modo offline) responde primeiro pelo cache, inclusive o manifesto. Uma logo nova podia ficar escondida atrás de uma cópia velha.

O que **não** era o problema: o conteúdo dos ícones (já são os da CD · Negativo) e o service worker substituir o do 1.0 (o `sw.js` do 2.0 é genérico e não guarda lista de arquivos).

## O que o build faz agora (`scripts/brand-assets.ts`)
Plugin do Vite, sem dependências novas, que roda no fim do build sobre `dist/`:

1. Calcula o SHA-256 (10 primeiros hex) de cada ícone do conjunto `VERSIONED_ICONS` e o copia para `/brand/h/<hash>/<nome>`.
2. Reescreve `manifest.webmanifest`: os `src` dos ícones (e dos atalhos, se existirem) passam a apontar para esses endereços.
3. Em **todas** as páginas `.html` (inclusive os aliases `/versos/`, `/versoes/…`) troca/insere `<link>` de manifesto, favicon (`.ico` e `.svg`) e ícone de toque, também com endereços versionados.
4. Apaga pastas de hash que sobraram. Os arquivos-fonte em `public/` continuam com nome fixo e são os únicos que existem no repositório, então nada antigo se acumula.

Propriedades:
- Mesmo conteúdo, mesmo endereço: dois builds seguidos produzem os mesmos nomes e o mesmo manifesto.
- Conteúdo diferente, endereço diferente, sem intervenção manual.
- Um ícone do manifesto que não exista, ou um `/brand/…` fora do conjunto, **quebra o build** em vez de virar 404 em produção.
- Os nomes fixos (`/brand/icon-192.png`, `/favicon.ico`) seguem existindo: navegadores pedem `/favicon.ico` sozinhos em páginas sem `<link>`.
- No servidor de desenvolvimento os `<link>` entram sem hash.

Para trocar a logo: substitua os arquivos em `public/brand/` (SVG e PNG) e `public/favicon.ico`. **Os PNG e o `.ico` são gerados a partir do SVG e não são regenerados pelo build**: se só o SVG mudar, os PNG continuam com a logo velha (e o hash deles, igual). Troque todos.

## Cache e service worker
- `/brand/h/*`: `Cache-Control: public, max-age=31536000, immutable` (o endereço muda com o conteúdo).
- `/manifest.webmanifest`, `/sw.js`, `/favicon.ico`: `max-age=0, must-revalidate`. Regras no `vercel.json` (Vercel) e em `public/_headers` (Cloudflare Pages).
- `public/sw.js`: o manifesto agora vai à **rede primeiro** e só usa a cópia instalada sem conexão. Ícones com hash seguem cache-first (seguro, pois o endereço é único). O offline continua igual.
- Os ícones com hash entram no pacote offline (`generate-offline-manifest.mjs`); ao atualizar, o motor já remove do cache os arquivos que saíram do manifesto.
- Nada apaga dados: não há `Clear-Site-Data`, nem limpeza de IndexedDB, localStorage ou do cache de arquivos instalados (há teste para isso).

## Limites que dependem do navegador
- **Não dá para forçar** a troca do ícone de um app já instalado. O navegador decide quando reconfere o manifesto (Chrome/Edge no computador: ao abrir o app, em geral no máximo uma vez por dia; Android: o ícone de um WebAPK é atualizado por um processo do sistema, pode levar dias e às vezes pede confirmação; iOS/Safari: o ícone da tela de início é uma cópia feita na hora de adicionar e **não** é atualizado, é preciso remover e adicionar de novo).
- Se o app foi instalado a partir de um endereço de teste com `id` `/launcher/`, ele é outro app para o navegador; ali também é preciso reinstalar.
- Não foi possível testar a atualização do ícone instalado em um navegador real nesta sessão. Os testes automáticos garantem manifesto, arquivos, hash, cabeçalhos, service worker e instalabilidade; a troca do ícone na área de trabalho do aparelho precisa ser conferida à mão (abaixo).

## Como conferir a atualização do ícone instalado
1. Abra `https://codingtxt.vercel.app/launcher/` no navegador e veja em `Ver código-fonte` os `<link rel="manifest">` e `rel="icon"`: os endereços têm `/brand/h/<hash>/`.
2. Abra `/manifest.webmanifest` e confira `"id": "/"` e os ícones em `/brand/h/…`.
3. Chrome/Edge: DevTools → Application → Manifest mostra id, ícones e "Installability". Para o app já instalado, abra-o uma vez, feche e abra de novo no dia seguinte; em `chrome://apps` ou na lista de apps o ícone deve mudar. Android: aguarde a atualização do sistema (ou, se necessário, desinstale e instale de novo).
4. Quando a logo mudar de novo, o hash no endereço muda sozinho; confira com o passo 2.
