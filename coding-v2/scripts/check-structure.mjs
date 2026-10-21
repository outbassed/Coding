import { existsSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const expected = [
  'index.html', 'launcher/index.html', 'apps/etiquetas/index.html', 'apps/texto/index.html',
  'src/main-launcher.ts', 'src/main-editor.ts', 'src/shared/catalog.ts', 'src/router/index.ts',
  'src/styles/tokens.css', 'src/styles/base.css', 'package-lock.json'
];
for (const path of expected) assert.ok(existsSync(path), 'Falta arquivo: ' + path);

const c = readFileSync('src/shared/catalog.ts', 'utf8');
for (const id of ['labels', 'texts', 'calc', 'images', 'pdf', 'codes', 'sheet-labels', 'draw', 'split']) assert.ok(c.includes("id: '" + id + "'"), 'Ferramenta ausente: ' + id);
assert.equal((c.match(/initiallyActive: true/g) ?? []).length, 2, 'Somente Etiquetas e Texto devem iniciar ativos.');
assert.equal((c.match(/status: 'preview'/g) ?? []).length, 2, 'Somente dois apps têm casca nesta etapa.');

const config = readFileSync('vite.config.ts', 'utf8');
for (const name of ['launcher/index.html', 'apps/etiquetas/index.html', 'apps/texto/index.html']) assert.ok(config.includes(name), 'vite.config sem entrada ' + name);

// Anti-piscada de tema: script inline antes do carregamento do app em todas as entradas.
for (const page of ['launcher/index.html', 'apps/etiquetas/index.html', 'apps/texto/index.html']) {
  const html = readFileSync(page, 'utf8');
  assert.ok(html.indexOf('coding-v2-theme') > -1 && html.indexOf('coding-v2-theme') < html.indexOf('type="module"'), 'Script de tema ausente ou tardio em ' + page);
  assert.ok(html.includes('viewport-fit=cover'), 'viewport-fit=cover ausente em ' + page);
}

// Nenhuma PWA nesta etapa: nada de manifest nem service worker.
for (const page of ['launcher/index.html', 'apps/etiquetas/index.html', 'apps/texto/index.html']) {
  const html = readFileSync(page, 'utf8');
  assert.ok(!html.includes('rel="manifest"') && !html.includes('serviceWorker'), 'PWA não comprovada não pode ser declarada em ' + page);
}
assert.ok(!existsSync('src/sw.ts') && !existsSync('public/sw.js'), 'Service worker não deve existir nesta etapa.');

// O banco legado nunca é aberto por esta base.
const sources = ['src/stores/apps.ts', 'src/stores/settings.ts', 'src/EditorApp.vue', 'src/main-editor.ts', 'src/main-launcher.ts'];
for (const file of sources) assert.ok(!/indexedDB\.open|coding-db/.test(readFileSync(file, 'utf8')), 'Acesso ao coding-db proibido em ' + file);

console.log('Estrutura Coding 2.0 verificada: nove apps, três entradas, tema sem piscada, sem PWA, sem acesso ao coding-db.');
