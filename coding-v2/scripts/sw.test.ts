import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

/** Executa o service worker de verdade num sandbox, com cache e rede falsos, e pede arquivos a ele. */
function loadWorker(cached: Record<string, string>, network: (url: string) => Promise<Response>) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const cache = { match: async (path: string) => (path in cached ? new Response(cached[path]) : undefined) };
  const sandbox = {
    self: { addEventListener: (type: string, fn: (e: unknown) => void) => { listeners[type] = fn; }, location: { origin: 'https://coding.test' }, skipWaiting: () => Promise.resolve(), clients: { claim: () => Promise.resolve() } },
    caches: { open: async () => cache, keys: async () => [], delete: async () => true },
    fetch: (request: Request) => network(request.url), Response, URL
  };
  vm.runInNewContext(readFileSync(resolve(import.meta.dirname, '../public/sw.js'), 'utf8'), sandbox);
  return async (path: string): Promise<string> => {
    let answer: Promise<Response> | undefined;
    const request = { method: 'GET', url: 'https://coding.test' + path, mode: 'no-cors', cache: 'default' };
    listeners.fetch!({ request, respondWith: (p: Promise<Response>) => { answer = p; } });
    if (!answer) throw new Error('o service worker deixou passar: ' + path);
    return (await answer).text();
  };
}

describe('service worker', () => {
  it('manifesto: com rede, entrega o novo, mesmo que exista uma cópia velha no cache', async () => {
    const get = loadWorker({ '/manifest.webmanifest': 'VELHO' }, async () => new Response('NOVO'));
    expect(await get('/manifest.webmanifest')).toBe('NOVO');
  });
  it('manifesto: sem rede, usa a cópia instalada (offline continua funcionando)', async () => {
    const get = loadWorker({ '/manifest.webmanifest': 'VELHO' }, async () => { throw new TypeError('offline'); });
    expect(await get('/manifest.webmanifest')).toBe('VELHO');
  });
  it('ícone com hash instalado vem do cache, sem ir à rede', async () => {
    const get = loadWorker({ '/brand/h/abc1234567/icon-192.png': 'PNG' }, async () => { throw new Error('não devia ir à rede'); });
    expect(await get('/brand/h/abc1234567/icon-192.png')).toBe('PNG');
  });
  it('ícone com hash novo (fora do cache) é buscado na rede', async () => {
    const get = loadWorker({ '/brand/h/aaaaaaaaaa/icon-192.png': 'ANTIGO' }, async (url) => new Response('REDE:' + url.slice(url.indexOf('/brand'))));
    expect(await get('/brand/h/bbbbbbbbbb/icon-192.png')).toBe('REDE:/brand/h/bbbbbbbbbb/icon-192.png');
  });
});
