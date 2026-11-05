import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HASH_LENGTH, VERSIONED_ICONS, buildIconMap, contentHash, processDist, rewriteHtml, rewriteManifest, versionedUrl } from './brand-assets';

const root = resolve(import.meta.dirname, '..');
const tmp: string[] = [];
afterEach(() => { for (const dir of tmp.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const scratch = (): string => { const dir = mkdtempSync(join(tmpdir(), 'brand-')); tmp.push(dir); return dir; };

const MANIFEST = JSON.stringify({
  id: '/', name: 'Coding Launcher', short_name: 'Coding', start_url: '/launcher/', scope: '/', display: 'standalone',
  icons: [
    { src: '/brand/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ],
  shortcuts: [{ name: 'Início', url: '/launcher/', icons: [{ src: '/brand/icon-192.png', sizes: '192x192' }] }]
}, null, 2);

/** Um "dist" de mentira: cada ícone com bytes próprios, o manifesto e páginas (inclusive aninhadas). */
function fakeDist(tweak: Record<string, string> = {}): string {
  const dist = scratch();
  for (const url of VERSIONED_ICONS) {
    const file = join(dist, url);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, tweak[url] ?? 'conteudo de ' + url);
  }
  writeFileSync(join(dist, 'manifest.webmanifest'), MANIFEST);
  const page = '<!doctype html><html><head><meta charset="utf-8"><title>x</title><link rel="stylesheet" href="/a.css"><link rel="icon" href="/brand/icon.svg"></head><body></body></html>';
  for (const p of ['index.html', 'launcher/index.html', 'apps/texto/index.html', 'versos/index.html']) { mkdirSync(dirname(join(dist, p)), { recursive: true }); writeFileSync(join(dist, p), page); }
  return dist;
}
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(dir, e.name)).map((f) => e.name + '/' + f) : [e.name]);
const read = (dist: string, p: string): string => readFileSync(join(dist, p), 'utf8');

describe('hash dos ícones', () => {
  it('é estável para o mesmo conteúdo e muda quando o conteúdo muda', () => {
    const a = contentHash(Buffer.from('logo A'));
    expect(contentHash(Buffer.from('logo A'))).toBe(a);
    expect(contentHash(Buffer.from('logo B'))).not.toBe(a);
    expect(a).toMatch(new RegExp('^[0-9a-f]{' + HASH_LENGTH + '}$'));
  });
  it('o endereço versionado guarda o nome do arquivo e fica em /brand/h/<hash>/', () => {
    expect(versionedUrl('/brand/icon-192.png', 'abc123abc1')).toBe('/brand/h/abc123abc1/icon-192.png');
    expect(versionedUrl('/favicon.ico', 'abc123abc1')).toBe('/brand/h/abc123abc1/favicon.ico');
  });
});

describe('processDist', () => {
  it('repetir o build sem mudanças mantém exatamente os mesmos endereços e arquivos', () => {
    const first = processDist(fakeDist()); const dist2 = fakeDist(); const second = processDist(dist2);
    expect(second).toEqual(first);
    const snapshot = Object.fromEntries(walk(dist2).map((f) => [f, read(dist2, f)]));
    expect(processDist(dist2)).toEqual(first); // rodar de novo sobre a própria saída também não muda nada
    expect(Object.fromEntries(walk(dist2).map((f) => [f, read(dist2, f)]))).toEqual(snapshot);
  });

  it('alterar uma imagem gera um endereço novo só para ela e atualiza o manifesto', () => {
    const before = processDist(fakeDist());
    const dist = fakeDist({ '/brand/icon-192.png': 'LOGO NOVA' });
    const after = processDist(dist);
    expect(after['/brand/icon-192.png']).not.toBe(before['/brand/icon-192.png']);
    for (const url of VERSIONED_ICONS) if (url !== '/brand/icon-192.png') expect(after[url], url).toBe(before[url]);
    const manifest = JSON.parse(read(dist, 'manifest.webmanifest')) as { icons: { src: string }[]; shortcuts: { icons: { src: string }[] }[] };
    expect(manifest.icons.map((i) => i.src)).toContain(after['/brand/icon-192.png']);
    expect(manifest.shortcuts[0]!.icons[0]!.src).toBe(after['/brand/icon-192.png']);
    expect(readFileSync(join(dist, after['/brand/icon-192.png']!), 'utf8')).toBe('LOGO NOVA');
  });

  it('não acumula endereços antigos: ao mudar o ícone, a pasta do hash anterior some', () => {
    const dist = fakeDist();
    const before = processDist(dist);
    writeFileSync(join(dist, 'brand/icon-192.png'), 'OUTRA LOGO');
    const after = processDist(dist);
    expect(existsSync(join(dist, before['/brand/icon-192.png']!))).toBe(false);
    expect(existsSync(join(dist, after['/brand/icon-192.png']!))).toBe(true);
    expect(readdirSync(join(dist, 'brand/h')).length).toBe(new Set(Object.values(after).map((u) => u.split('/')[3])).size);
  });

  it('todas as páginas, aninhadas ou alias, declaram manifesto, favicon e ícone de toque versionados, uma vez cada', () => {
    const dist = fakeDist(); const map = processDist(dist);
    for (const page of ['index.html', 'launcher/index.html', 'apps/texto/index.html', 'versos/index.html']) {
      const html = read(dist, page);
      expect(html.match(/<link rel="manifest"/g)).toHaveLength(1);
      expect(html).toContain('href="' + map['/favicon.ico'] + '"');
      expect(html).toContain('href="' + map['/brand/favicon.svg'] + '"');
      expect(html).toContain('<link rel="apple-touch-icon" href="' + map['/brand/apple-touch-icon.png'] + '">');
      expect(html).not.toContain('href="/brand/icon.svg"'); // o <link rel=icon> antigo foi trocado
      expect(html).toContain('<link rel="stylesheet" href="/a.css">'); // o resto do <head> fica como estava
    }
  });

  it('falha o build quando um ícone do conjunto não existe', () => {
    const dist = fakeDist(); rmSync(join(dist, 'brand/icon-512.png'));
    expect(() => processDist(dist)).toThrow(/icon-512/);
  });
});

describe('rewriteManifest e rewriteHtml', () => {
  const map = buildIconMapFrom();
  function buildIconMapFrom() { return buildIconMap(fakeDist()); }
  it('preserva id, nome, escopo e cores; só troca os endereços dos ícones', () => {
    const out = JSON.parse(rewriteManifest(MANIFEST, map)) as Record<string, unknown>;
    const src = JSON.parse(MANIFEST) as Record<string, unknown>;
    for (const key of ['id', 'name', 'short_name', 'start_url', 'scope', 'display']) expect(out[key], key).toBe(src[key]);
  });
  it('recusa um ícone /brand/ que não faz parte do conjunto versionado', () => {
    const bad = JSON.stringify({ icons: [{ src: '/brand/logo-horizontal-light.svg', sizes: 'any' }] });
    expect(() => rewriteManifest(bad, map)).toThrow(/fora do conjunto/);
  });
  it('rewriteHtml é idempotente e exige </head>', () => {
    const html = '<html><head><title>t</title></head><body></body></html>';
    const once = rewriteHtml(html, map);
    expect(rewriteHtml(once, map)).toBe(once);
    expect(() => rewriteHtml('<html><body></body></html>', map)).toThrow();
  });
});

describe('arquivos reais do projeto', () => {
  const real = (): string => {
    const dist = scratch();
    mkdirSync(join(dist, 'brand'), { recursive: true });
    cpSync(join(root, 'public/brand'), join(dist, 'brand'), { recursive: true });
    cpSync(join(root, 'public/favicon.ico'), join(dist, 'favicon.ico'));
    cpSync(join(root, 'public/manifest.webmanifest'), join(dist, 'manifest.webmanifest'));
    writeFileSync(join(dist, 'index.html'), '<html><head></head><body></body></html>');
    return dist;
  };
  it('o manifesto real fica instalável e aponta só para arquivos que existem, todos com hash', () => {
    const dist = real(); processDist(dist);
    const manifest = JSON.parse(read(dist, 'manifest.webmanifest')) as { id: string; start_url: string; scope: string; display: string; icons: { src: string; sizes: string; type: string; purpose?: string }[] };
    expect(manifest.id).toBe('/'); // o mesmo id do Coding 1.0 (./ → /): quem já instalou continua sendo o mesmo app
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === '192x192' && i.type === 'image/png')).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === '512x512' && i.type === 'image/png' && (i.purpose ?? 'any') === 'any')).toBe(true);
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) {
      expect(icon.src, icon.src).toMatch(/^\/brand\/h\/[0-9a-f]{10}\/[a-z0-9-]+\.(png|svg)$/);
      const hash = icon.src.split('/')[3]!;
      expect(contentHash(readFileSync(join(dist, icon.src))), icon.src).toBe(hash);
    }
  });
  it('cabeçalhos: ícones com hash em cache longo; manifesto e service worker sempre revalidados (Vercel e Cloudflare)', () => {
    const vercel = JSON.parse(readFileSync(resolve(root, '../vercel.json'), 'utf8')) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
    const rule = (source: string) => vercel.headers.find((h) => h.source === source)?.headers.find((h) => h.key === 'Cache-Control')?.value ?? '';
    expect(rule('/brand/h/(.*)')).toContain('immutable');
    expect(rule('/manifest.webmanifest')).toMatch(/max-age=0.*must-revalidate/);
    expect(rule('/sw.js')).toMatch(/max-age=0.*must-revalidate/);
    const cf = readFileSync(join(root, 'public/_headers'), 'utf8');
    expect(cf).toMatch(/\/brand\/h\/\*\n\s+Cache-Control: .*immutable/);
    expect(cf).toMatch(/\/manifest\.webmanifest\n\s+Cache-Control: .*must-revalidate/);
    expect(cf).toMatch(/\/sw\.js\n\s+Cache-Control: .*must-revalidate/);
  });
  it('nada na atualização dos ícones apaga dados do usuário', () => {
    for (const file of ['public/sw.js', 'public/_headers', '../vercel.json', 'scripts/brand-assets.ts']) {
      const text = readFileSync(join(root, file), 'utf8');
      expect(text, file).not.toMatch(/Clear-Site-Data|deleteDatabase|localStorage\.clear|indexedDB\.deleteDatabase|caches\.delete\(\s*['"`]coding-v2-offline/);
    }
  });
});
