import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, resolve, sep } from 'node:path';

/**
 * Gera o SW apenas DEPOIS do build do Vite, usando arquivos que realmente
 * existem em dist. Não depende de CDN e não armazena documentos do usuário.
 * O registro exige ativação explícita no Preview isolado.
 */
const root = resolve('dist');
const allowed = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.woff', '.woff2', '.ico']);
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (entry.isFile() && allowed.has(entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase()) && entry.name !== 'sw.js') files.push(file);
  }
}
await walk(root);
files.sort();
if (!files.some((f) => f.endsWith('launcher/index.html')) || !files.some((f) => f.endsWith('apps/pdf/index.html'))) {
  throw new Error('Build incompleto: páginas essenciais não foram produzidas.');
}
const digest = createHash('sha256');
for (const f of files) { digest.update(relative(root, f)); digest.update(await readFile(f)); }
const version = digest.digest('hex').slice(0, 16);
const urls = files.map((f) => '/' + relative(root, f).split(sep).join('/'));
const sw = `/* Gerado automaticamente por scripts/generate-sw.mjs; não edite manualmente. */
const CACHE = 'coding-v2-static-${version}';
const PRECACHE = ${JSON.stringify(urls)};
const PATHS = new Set(PRECACHE);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll falha a instalação se QUALQUER recurso não estiver disponível.
    // O SW anterior continua ativo; não declaramos offline com cache parcial.
    await cache.addAll(PRECACHE);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('coding-v2-static-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Jamais cachear dados da API, downloads, backups ou URLs externas.
  const path = request.mode === 'navigate' && url.pathname.endsWith('/')
    ? url.pathname + 'index.html' : url.pathname;
  if (!PATHS.has(path)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (request.mode === 'navigate') {
      // Online: buscar HTML atual; offline: HTML estático correspondente.
      try { const fresh = await fetch(request); if (fresh.ok) return fresh; }
      catch { /* rede indisponível */ }
      return (await cache.match(path)) || Response.error();
    }
    return (await cache.match(path)) || fetch(request);
  })());
});
`;
await writeFile(join(root, 'sw.js'), sw);
console.log(`SW Preview ${version}: ${urls.length} recursos pré-armazenáveis`);
