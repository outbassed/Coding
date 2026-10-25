import { existsSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const APP_PAGES = ['apps/etiquetas/index.html', 'apps/texto/index.html', 'apps/planilhas/index.html', 'apps/imagens/index.html', 'apps/pdf/index.html', 'apps/qr/index.html', 'apps/planilha-etiquetas/index.html', 'apps/sorteio/index.html', 'apps/racha-conta/index.html'];
const expected = [
  'index.html', 'launcher/index.html', ...APP_PAGES, 'src/main-apps.ts',
  'src/main-launcher.ts', 'src/main-editor.ts', 'src/shared/catalog.ts', 'src/router/index.ts',
  'src/styles/tokens.css', 'src/styles/base.css', 'package-lock.json'
];
for (const path of expected) assert.ok(existsSync(path), 'Falta arquivo: ' + path);

const c = readFileSync('src/shared/catalog.ts', 'utf8');
for (const id of ['labels', 'texts', 'calc', 'images', 'pdf', 'codes', 'draw', 'split']) assert.ok(c.includes("id: '" + id + "'"), 'Ferramenta ausente: ' + id);
assert.equal((c.match(/status: 'preview'/g) ?? []).length, 8, 'Os oito apps devem existir no Coding 2.0.');

const config = readFileSync('vite.config.ts', 'utf8');
for (const name of ['launcher/index.html', ...APP_PAGES]) assert.ok(config.includes(name), 'vite.config sem entrada ' + name);

// Anti-piscada de tema: script inline antes do carregamento do app em todas as entradas.
for (const page of ['launcher/index.html', ...APP_PAGES]) {
  const html = readFileSync(page, 'utf8');
  assert.ok(html.indexOf('coding-v2-theme') > -1 && html.indexOf('coding-v2-theme') < html.indexOf('type="module"'), 'Script de tema ausente ou tardio em ' + page);
  assert.ok(html.includes('viewport-fit=cover'), 'viewport-fit=cover ausente em ' + page);
}

// Offline é opt-in e depende de um build isolado; nunca se registra automaticamente.
for (const file of ['public/manifest.webmanifest', 'src/pwa.ts', 'scripts/generate-sw.mjs']) {
  assert.ok(existsSync(file), 'Falta infraestrutura opcional de PWA: ' + file);
}
const pwa = readFileSync('src/pwa.ts', 'utf8');
assert.ok(pwa.includes('VITE_CODING_PREVIEW_PWA') && pwa.includes('codingtxt.vercel.app'), 'A PWA deve exigir opt-in e proteger produção.');

// O banco legado nunca é aberto por esta base.
const sources = ['src/stores/apps.ts', 'src/stores/settings.ts', 'src/EditorApp.vue', 'src/main-editor.ts', 'src/main-launcher.ts', 'src/main-apps.ts', 'src/editors/docs.ts', 'src/editors/useDocument.ts'];
for (const file of sources) assert.ok(!/indexedDB\.open|coding-db/.test(readFileSync(file, 'utf8')), 'Acesso ao coding-db proibido em ' + file);

console.log('Estrutura Coding 2.0 verificada: oito apps com página própria, tema sem piscada, PWA opcional e protegida, sem acesso ao coding-db.');
