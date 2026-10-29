import type { Connect, Plugin } from 'vite';

/**
 * Endereços curtos de aplicativos em hospedagem estática. O endereço canônico segue o padrão `/apps/<nome>/`
 * (o mesmo do catálogo, dos documentos e da instalação offline); o alias serve a MESMA página, para que
 * `/versos/` abra, recarregue e possa ser compartilhado sem regra de reescrita no servidor.
 * Ao abrir um projeto, o aplicativo troca o endereço pelo canônico (history.replaceState), então a barra
 * de endereço mostra `/apps/versos/?doc=…` depois de salvar.
 */
export const APP_ALIASES: Readonly<Record<string, string>> = { 'versos': 'apps/versos' };

export function appAliases(): Plugin {
  const rewrite: Connect.NextHandleFunction = (req, _res, next) => {
    const url = req.url ?? '';
    const path = url.split('?')[0] ?? '';
    const m = /^\/([a-z-]+)\/?(?:index\.html)?$/.exec(path);
    const target = m ? APP_ALIASES[m[1]!] : undefined;
    if (target) req.url = '/' + target + '/index.html' + (url.includes('?') ? url.slice(url.indexOf('?')) : '');
    next();
  };
  return {
    name: 'coding-app-aliases',
    configureServer(server) { server.middlewares.use(rewrite); },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        for (const [alias, target] of Object.entries(APP_ALIASES)) {
          const page = bundle[target + '/index.html'];
          if (!page || page.type !== 'asset') throw new Error(target + '/index.html ausente no build: o alias /' + alias + '/ não pôde ser gerado.');
          this.emitFile({ type: 'asset', fileName: alias + '/index.html', source: page.source });
        }
      }
    }
  };
}
