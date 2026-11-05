import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Ícones da marca com URL versionada pelo CONTEÚDO (hash), feito sozinho no build.
 *
 * Por quê: o navegador só atualiza o ícone de um app instalado (e o favicon das abas) quando enxerga um manifesto/URL diferente.
 * Com nomes fixos (`/brand/icon-192.png`) e cache, uma logo nova pode ficar invisível. Aqui cada ícone publicado ganha o
 * endereço `/brand/h/<hash>/<nome>`: se os bytes não mudam, o endereço não muda (builds repetidos são idênticos); se mudam,
 * o endereço muda e o manifesto e as páginas passam a apontar para o novo.
 *
 * O que acontece no `dist/` (nada na pasta do código-fonte, então nenhum arquivo antigo se acumula no repositório):
 *   1. cada ícone de VERSIONED_ICONS é copiado para `brand/h/<hash>/<nome>`; diretórios de hash que sobraram são apagados;
 *   2. `manifest.webmanifest` tem os `src` dos ícones (e dos atalhos) trocados pelos endereços versionados;
 *   3. todas as páginas `.html` ficam com `<link>` de manifesto, favicon e ícone de toque apontando para os endereços versionados.
 * Os nomes antigos (`/brand/icon-192.png`, `/favicon.ico`) continuam existindo como atalho estável: navegadores pedem
 * `/favicon.ico` sozinhos em páginas sem `<link>`.
 */
export const VERSIONED_ICONS = [
  '/brand/favicon.svg', '/favicon.ico',
  '/brand/icon.svg', '/brand/icon-192.png', '/brand/icon-512.png', '/brand/icon-maskable-512.png', '/brand/apple-touch-icon.png'
] as const;
export const HASH_LENGTH = 10;
export const VERSIONED_DIR = 'brand/h';
export const MANIFEST_URL = '/manifest.webmanifest';

export type IconMap = Record<string, string>;

export const contentHash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex').slice(0, HASH_LENGTH);
export const versionedUrl = (url: string, hash: string): string => '/' + VERSIONED_DIR + '/' + hash + '/' + url.slice(url.lastIndexOf('/') + 1);
/** Mapa "endereço fixo → endereço versionado" a partir dos arquivos que de fato estão em `root` (a saída do build). */
export function buildIconMap(root: string): IconMap {
  const map: IconMap = {};
  for (const url of VERSIONED_ICONS) {
    const file = join(root, url);
    if (!existsSync(file)) throw new Error('Ícone da marca ausente no build: ' + url);
    map[url] = versionedUrl(url, contentHash(readFileSync(file)));
  }
  return map;
}
/** Mapa de desenvolvimento: sem hash, porque o servidor de desenvolvimento serve os arquivos como estão. */
export const identityMap = (): IconMap => Object.fromEntries(VERSIONED_ICONS.map((u) => [u, u]));

const LINK_TAG = /<link\b[^>]*\brel\s*=\s*["'](?:shortcut icon|icon|apple-touch-icon|manifest)["'][^>]*>\s*/gi;
export function headLinks(map: IconMap): string {
  return [
    `<link rel="manifest" href="${MANIFEST_URL}">`,
    `<link rel="icon" href="${map['/favicon.ico']}" sizes="48x48">`,
    `<link rel="icon" href="${map['/brand/favicon.svg']}" type="image/svg+xml" sizes="any">`,
    `<link rel="apple-touch-icon" href="${map['/brand/apple-touch-icon.png']}">`
  ].join('');
}
/** Troca (ou coloca) os `<link>` de manifesto e ícones. Idempotente: rodar duas vezes dá o mesmo HTML. */
export function rewriteHtml(html: string, map: IconMap): string {
  const clean = html.replace(LINK_TAG, '');
  if (!/<\/head>/i.test(clean)) throw new Error('Página sem </head>: não dá para declarar o manifesto e os ícones.');
  return clean.replace(/<\/head>/i, headLinks(map) + '</head>');
}

interface IconEntry { src: string; [key: string]: unknown }
interface ManifestShape { icons?: IconEntry[]; shortcuts?: { icons?: IconEntry[]; [key: string]: unknown }[]; [key: string]: unknown }
/** Troca os `src` dos ícones (e dos ícones dos atalhos). Um `/brand/…` que não existe falha o build em vez de virar 404 em produção. */
export function rewriteManifest(source: string, map: IconMap): string {
  const manifest = JSON.parse(source) as ManifestShape;
  const swap = (icons: IconEntry[] | undefined): IconEntry[] | undefined => icons?.map((icon) => {
    const next = map[icon.src];
    if (next) return { ...icon, src: next };
    if (icon.src.startsWith('/brand/') && !icon.src.startsWith('/' + VERSIONED_DIR + '/')) throw new Error('O manifesto aponta para um ícone fora do conjunto versionado: ' + icon.src);
    return icon;
  });
  if (manifest.icons) manifest.icons = swap(manifest.icons)!;
  for (const shortcut of manifest.shortcuts ?? []) if (shortcut.icons) shortcut.icons = swap(shortcut.icons)!;
  return JSON.stringify(manifest, null, 2) + '\n';
}

function htmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
    else if (name.endsWith('.html')) out.push(full);
  }
  return out;
}

/** Faz tudo no diretório de saída. Devolve o mapa para quem quiser conferir. */
export function processDist(dist: string): IconMap {
  const map = buildIconMap(dist);
  // 1) cópias versionadas e limpeza das que sobraram de builds anteriores
  const keep = new Set<string>();
  for (const [url, versioned] of Object.entries(map)) {
    const target = join(dist, versioned);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(dist, url), target);
    keep.add(versioned.split('/')[3]!);
  }
  const root = join(dist, VERSIONED_DIR);
  for (const dir of readdirSync(root)) if (!keep.has(dir)) rmSync(join(root, dir), { recursive: true, force: true });
  // 2) manifesto
  const manifestFile = join(dist, MANIFEST_URL);
  if (!existsSync(manifestFile)) throw new Error('manifest.webmanifest ausente no build.');
  const manifest = rewriteManifest(readFileSync(manifestFile, 'utf8'), map);
  writeFileSync(manifestFile, manifest);
  for (const icon of (JSON.parse(manifest) as ManifestShape).icons ?? []) if (!existsSync(join(dist, icon.src))) throw new Error('Ícone do manifesto não existe na saída: ' + icon.src);
  // 3) páginas
  for (const file of htmlFiles(dist)) writeFileSync(file, rewriteHtml(readFileSync(file, 'utf8'), map));
  return map;
}

export function brandAssets(): Plugin {
  let isBuild = false;
  let dist = '';
  return {
    name: 'coding-brand-assets',
    enforce: 'post',
    configResolved(config) { isBuild = config.command === 'build'; dist = resolve(config.root, config.build.outDir); },
    // Desenvolvimento: mesmos <link>, sem hash.
    transformIndexHtml(html, ctx) { return ctx.server ? rewriteHtml(html, identityMap()) : html; },
    closeBundle() { if (isBuild) processDist(dist); }
  };
}
