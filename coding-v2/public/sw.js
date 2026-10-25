/*
 * Service worker do Coding 2.0 Preview (genérico, sem lista de arquivos).
 *
 * Os arquivos offline são baixados PELA PÁGINA, app por app, para o cache `coding-v2-offline-files`
 * (veja src/offline). Este arquivo só decide como responder: o que está no cache vem de lá; o resto vai à rede.
 * Como não há lista embutida, uma nova versão deste arquivo NUNCA apaga o que foi instalado por app.
 * Documentos, backups e configurações ficam em IndexedDB/localStorage e não passam por aqui.
 */
const FILES = 'coding-v2-offline-files';
const NEVER = new Set(['/sw.js', '/offline-manifest.json']);

self.addEventListener('install', (event) => { event.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Só o formato antigo (cache único com tudo) é removido; o cache por app permanece.
    for (const key of await caches.keys()) if (key.startsWith('coding-v2-static-')) await caches.delete(key);
    await self.clients.claim();
  })());
});

const FALLBACK = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sem conexão · Coding 2.0</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:32px 20px;background:#fff;color:#141922}@media(prefers-color-scheme:dark){body{background:#171c24;color:#eef1f6}}main{max-width:520px;margin:0 auto}a{color:inherit;font-weight:700}</style></head>
<body><main><h1>Este aplicativo não está disponível offline</h1>
<p>Você está sem conexão e este aplicativo não foi instalado para uso offline neste navegador. Isso é diferente de estar desativado no Launcher: seus documentos continuam salvos.</p>
<p>Conecte-se à internet para abri-lo, ou instale-o antes em <strong>Ajustes → Uso sem internet</strong>.</p>
<p><a href="/launcher/">Abrir o Launcher</a></p></main></body></html>`;

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || NEVER.has(url.pathname)) return;
  // Downloads de instalação/atualização (cache: reload/no-store) sempre vão à rede.
  if (request.cache === 'reload' || request.cache === 'no-store') return;
  const path = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
  event.respondWith((async () => {
    const cache = await caches.open(FILES);
    if (request.mode === 'navigate') {
      try { return await fetch(request); }
      catch {
        const hit = await cache.match(path);
        return hit || new Response(FALLBACK, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
    }
    const hit = await cache.match(path);
    if (hit) return hit;
    return fetch(request);
  })());
});
