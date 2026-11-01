import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, posix, relative, resolve, sep } from 'node:path';

/**
 * Roda DEPOIS do build do Vite e gera `dist/offline-manifest.json`: para o Núcleo do Launcher e para cada app, a
 * lista EXATA de arquivos que a página precisa (HTML, scripts, estilos, ícones, bibliotecas em /vendor), com tamanho
 * em bytes no disco e SHA-256 medidos agora, nos arquivos reais de `dist`.
 *
 * Como o grafo é montado: parte do HTML de cada página e segue, nos arquivos .js/.css emitidos, todo caminho de
 * arquivo que existe em `dist` (importações estáticas e dinâmicas do Vite, mapa de pré-carregamento, fontes e
 * imagens referidas pelo CSS, scripts de /vendor carregados em tempo de execução). Cada app tem a sua entrada, então
 * não há importações cruzadas entre apps. Arquivos compartilhados aparecem na lista de mais de um app.
 *
 * O service worker (public/sw.js) é genérico e NÃO contém lista de arquivos: assim uma nova versão não apaga o
 * que foi instalado por app. Nenhum dado do usuário passa por aqui.
 */
const root = resolve('dist');
const SKIP = new Set(['sw.js', 'offline-manifest.json']);
const TEXT = /\.(?:js|mjs|css|html)$/i;
const ALLOWED = /\.(?:html|js|mjs|css|json|webmanifest|svg|png|jpe?g|webp|woff2?|ico)$/i;

const all = new Map(); // caminho '/x/y' -> { abs }
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) await walk(abs);
    else if (entry.isFile() && ALLOWED.test(entry.name) && !SKIP.has(relative(root, abs).split(sep).join('/'))) {
      all.set('/' + relative(root, abs).split(sep).join('/'), { abs });
    }
  }
}
await walk(root);

const catalog = await readFile(resolve('src/shared/catalog.ts'), 'utf8');
const apps = [];
for (const m of catalog.matchAll(/\{ id: '([a-z-]+)', category:[^\n]*?name: '([^']+)'[^\n]*?path: '(\/apps\/[^']+\/)'/g)) apps.push({ id: m[1], name: m[2], page: m[3] + 'index.html' });
if (apps.length < 8) throw new Error('Catálogo incompleto ao gerar o manifesto offline: ' + apps.length + ' apps.');
for (const a of apps) if (!all.has(a.page)) throw new Error('Página do app ausente no build: ' + a.page);
if (!all.has('/launcher/index.html')) throw new Error('Build incompleto: /launcher/index.html ausente.');

const REF = /["'`(]((?:\.{1,2}\/|\/)?[A-Za-z0-9_@\-.\/]+\.(?:js|mjs|css|svg|png|jpe?g|webp|woff2?|json|webmanifest|ico))(?=["'`)?#\s])/g;
const cache = new Map();
async function textOf(path) { if (!cache.has(path)) cache.set(path, await readFile(all.get(path).abs, 'utf8')); return cache.get(path); }
function resolveRef(ref, from) {
  const tries = [];
  if (ref.startsWith('/')) tries.push(ref);
  else if (ref.startsWith('./') || ref.startsWith('../')) tries.push(posix.normalize(posix.join(posix.dirname(from), ref)));
  else { tries.push('/' + ref); tries.push(posix.normalize(posix.join(posix.dirname(from), ref))); }
  return tries.find((t) => all.has(t));
}
async function graph(entry, extra = []) {
  const seen = new Set();
  const queue = [entry, ...extra];
  while (queue.length) {
    const path = queue.shift();
    if (!path || seen.has(path) || !all.has(path)) continue;
    seen.add(path);
    if (!TEXT.test(path)) continue;
    const text = await textOf(path);
    for (const m of text.matchAll(REF)) {
      const found = resolveRef(m[1], path);
      if (found && !seen.has(found)) queue.push(found);
    }
    if (path.endsWith('.html')) for (const m of text.matchAll(/(?:src|href)="([^"#?]+)"/g)) { const found = resolveRef(m[1], path); if (found && !seen.has(found)) queue.push(found); }
  }
  return [...seen].sort();
}
async function describe(paths) {
  const files = [];
  for (const path of paths) {
    const buf = await readFile(all.get(path).abs);
    files.push({ path, bytes: (await stat(all.get(path).abs)).size, sha256: createHash('sha256').update(buf).digest('hex') });
  }
  return files;
}
const sum = (files) => files.reduce((n, f) => n + f.bytes, 0);

// Núcleo do Launcher: páginas, scripts, estilos, TODOS os ícones, manifesto da PWA e a página de entrada.
const iconPaths = [...all.keys()].filter((p) => p.startsWith('/legacy-icons/'));
const corePaths = [...new Set([...(await graph('/launcher/index.html', iconPaths)), ...(await graph('/index.html')), ...(all.has('/manifest.webmanifest') ? ['/manifest.webmanifest'] : [])])].sort();
const coreFiles = await describe(corePaths);
const coreSet = new Set(corePaths);

/** Páginas-alias geradas pelo build (scripts/app-aliases-plugin.ts). */
const ALIAS_PAGES = { '/apps/versos/index.html': '/versos/index.html' };
const appEntries = [];
for (const app of apps) {
  // Endereço curto do app (ex.: /versos/): a mesma página, incluída para abrir também sem rede.
  const alias = ALIAS_PAGES[app.page];
  const paths = await graph(app.page, alias && all.has(alias) ? [alias] : []);
  appEntries.push({ id: app.id, name: app.name, page: app.page, paths });
}
const owners = new Map();
for (const p of corePaths) owners.set(p, new Set(['core']));
for (const a of appEntries) for (const p of a.paths) { if (!owners.has(p)) owners.set(p, new Set()); owners.get(p).add(a.id); }

const appsOut = {};
for (const a of appEntries) {
  const files = await describe(a.paths);
  const own = files.filter((f) => owners.get(f.path).size === 1);
  const sharedWithCore = files.filter((f) => coreSet.has(f.path));
  const sharedWithApps = files.filter((f) => !coreSet.has(f.path) && owners.get(f.path).size > 1);
  const version = createHash('sha256').update(files.map((f) => f.path + ':' + f.sha256).join('\n')).digest('hex').slice(0, 16);
  appsOut[a.id] = { id: a.id, name: a.name, page: a.page, version, bytes: sum(files), ownBytes: sum(own), sharedWithCoreBytes: sum(sharedWithCore), sharedWithAppsBytes: sum(sharedWithApps), files };
}
const coreVersion = createHash('sha256').update(coreFiles.map((f) => f.path + ':' + f.sha256).join('\n')).digest('hex').slice(0, 16);
const build = createHash('sha256').update(coreVersion + Object.values(appsOut).map((a) => a.id + a.version).join('')).digest('hex').slice(0, 16);

const manifest = {
  schema: 1,
  build,
  note: 'Tamanhos em bytes dos arquivos no disco, sem compressão de rede. Arquivos compartilhados entre o Núcleo e os apps são baixados uma única vez.',
  core: { id: 'core', name: 'Núcleo do Launcher', page: '/launcher/index.html', version: coreVersion, bytes: sum(coreFiles), files: coreFiles },
  apps: appsOut
};
await writeFile(join(root, 'offline-manifest.json'), JSON.stringify(manifest, null, 1));
const fmt = (n) => (n / 1024).toFixed(0) + ' KB';
console.log(`Manifesto offline ${build}: núcleo ${coreFiles.length} arquivos (${fmt(manifest.core.bytes)})`);
for (const a of Object.values(appsOut)) console.log(`  ${a.id.padEnd(7)} ${String(a.files.length).padStart(3)} arquivos · ${fmt(a.bytes)} (próprios ${fmt(a.ownBytes)}, do núcleo ${fmt(a.sharedWithCoreBytes)}, entre apps ${fmt(a.sharedWithAppsBytes)})`);
