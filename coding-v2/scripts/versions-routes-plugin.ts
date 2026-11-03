import type { Connect, Plugin } from 'vite';
import { allSlugs } from '../src/shared/versions';

/**
 * Endereços diretos da Central de Versões em hospedagem estática (Cloudflare Pages): a página é UMA só
 * (`versoes/index.html`), copiada para `versoes/<slug>/index.html` de cada aplicativo e para o alias `/versions/…`.
 * Assim abrir, recarregar ou compartilhar `/versoes/etiquetas/` funciona sem regra de reescrita no servidor.
 * No servidor de desenvolvimento (que não tem esses arquivos), a mesma regra vira um middleware; o `vite preview` serve
 * os arquivos gerados como estão, exatamente como a hospedagem estática.
 */
export function versionsRoutes(): Plugin {
  const slugs = allSlugs().filter((s) => s !== 'launcher');
  const known = new Set(['launcher', ...slugs]);
  const rewrite: Connect.NextHandleFunction = (req, _res, next) => {
    const url = req.url ?? '';
    const path = url.split('?')[0] ?? '';
    const m = /^\/(versoes|versions)(?:\/([^/]*))?\/?$/.exec(path);
    if (m && (m[2] === undefined || known.has(m[2]))) req.url = '/versoes/index.html' + (url.includes('?') ? url.slice(url.indexOf('?')) : '');
    next();
  };
  return {
    name: 'coding-versions-routes',
    configureServer(server) { server.middlewares.use(rewrite); },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const page = bundle['versoes/index.html'];
        if (!page || page.type !== 'asset') throw new Error('versoes/index.html ausente no build: a Central de Versões não foi gerada.');
        const source = page.source;
        for (const slug of ['launcher', ...slugs]) this.emitFile({ type: 'asset', fileName: 'versoes/' + slug + '/index.html', source });
        // Alias /versions/…: a mesma página, que troca o endereço pelo oficial ao abrir.
        for (const slug of ['', 'launcher', ...slugs]) this.emitFile({ type: 'asset', fileName: 'versions/' + (slug ? slug + '/' : '') + 'index.html', source });
      }
    }
  };
}
