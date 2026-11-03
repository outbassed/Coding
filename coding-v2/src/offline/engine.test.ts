// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { damagedRecords, installEntries, missingFiles, pruneUnused, sizeSummary, uninstallEntry, updateAvailable } from './engine';
import { InstallError, type CachePort, type InstalledRecord, type LedgerPort, type ManifestEntry, type ManifestFile, type Ports } from './types';

const enc = (s: string) => new TextEncoder().encode(s);
async function sha(data: ArrayBuffer): Promise<string> { const d = await crypto.subtle.digest('SHA-256', data); return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
async function file(path: string, text: string): Promise<{ f: ManifestFile; text: string }> { return { f: { path, bytes: enc(text).byteLength, sha256: await sha(enc(text).buffer as ArrayBuffer) }, text }; }
const entry = (id: string, files: ManifestFile[], version = 'v1'): ManifestEntry => ({ id, name: id, page: files[0]!.path, version, bytes: files.reduce((n, f) => n + f.bytes, 0), files });

function world(contents: Record<string, string>) {
  const store = new Map<string, string>();
  const rows = new Map<string, InstalledRecord>();
  const requests: string[] = [];
  const cache: CachePort = {
    async keys() { return [...store.keys()]; },
    async put(path, body) { store.set(path, await body.text()); },
    async remove(path) { store.delete(path); }
  };
  const ledger: LedgerPort = {
    async all() { return [...rows.values()]; },
    async put(r) { rows.set(r.id, r); },
    async remove(id) { rows.delete(id); }
  };
  const state = { fail: new Set<string>(), corrupt: new Set<string>() };
  const ports: Ports = {
    cache, ledger, sha256: sha,
    async fetch(path, signal) {
      requests.push(path);
      if (signal.aborted) throw new Error('abort');
      if (state.fail.has(path)) return new Response('x', { status: 500 });
      const body = state.corrupt.has(path) ? 'CORROMPIDO!!' : contents[path];
      if (body === undefined) return new Response('', { status: 404 });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/plain' } });
    }
  };
  return { ports, store, rows, requests, state };
}
const run = (entries: ManifestEntry[], w: ReturnType<typeof world>, onProgress?: (p: { bytesDone: number; bytesTotal: number }) => void) =>
  installEntries(entries, w.ports, { signal: new AbortController().signal, onProgress });

describe('instalação offline por app', async () => {
  const shared = await file('/assets/vue-1.js', 'vue compartilhado');
  const core1 = await file('/launcher/index.html', '<html>launcher</html>');
  const a1 = await file('/apps/a/index.html', '<html>a</html>');
  const a2 = await file('/assets/a-1.js', 'codigo do app a');
  const b1 = await file('/apps/b/index.html', '<html>b</html>');
  const b2 = await file('/assets/b-1.js', 'codigo do app b');
  const contents = Object.fromEntries([shared, core1, a1, a2, b1, b2].map((x) => [x.f.path, x.text]));
  const core = entry('core', [core1.f, shared.f]);
  const appA = entry('a', [a1.f, a2.f, shared.f]);
  const appB = entry('b', [b1.f, b2.f, shared.f]);

  it('instala núcleo + app, com progresso real em bytes que termina no total', async () => {
    const w = world(contents);
    const seen: number[] = [];
    let total = 0;
    const out = await run([core, appA], w, (p) => { seen.push(p.bytesDone); total = p.bytesTotal; });
    expect(out.map((r) => r.id)).toEqual(['core', 'a']);
    expect(total).toBe(core1.f.bytes + shared.f.bytes + a1.f.bytes + a2.f.bytes); // o arquivo compartilhado conta uma vez
    expect(seen[seen.length - 1]).toBe(total);
    expect([...seen].sort((x, y) => x - y)).toEqual(seen);
    expect([...w.store.keys()].sort()).toEqual([a1.f.path, a2.f.path, core1.f.path, shared.f.path].sort());
    expect(w.requests.filter((p) => p === shared.f.path)).toHaveLength(1);
  });

  it('segundo app não baixa de novo o que já está instalado', async () => {
    const w = world(contents);
    await run([core, appA], w);
    w.requests.length = 0;
    await run([appB], w);
    expect(w.requests.sort()).toEqual([b1.f.path, b2.f.path].sort());
    expect(sizeSummary(appB, new Map([[shared.f.path, shared.f.sha256]])).toDownload).toBe(b1.f.bytes + b2.f.bytes);
  });

  it('HTML só é gravado depois dos demais arquivos', async () => {
    const w = world(contents);
    const order: string[] = [];
    const put = w.ports.cache.put;
    w.ports.cache.put = async (p, b, t) => { order.push(p); await put(p, b, t); };
    await run([appA], w);
    expect(order[order.length - 1]).toBe(a1.f.path);
  });

  it('desinstalar um app não quebra o outro e preserva arquivos compartilhados', async () => {
    const w = world(contents);
    await run([core, appA, appB], w);
    const r = await uninstallEntry('a', w.ports);
    expect(r.removed).toBe(2); // html + js do app a
    expect(r.kept).toBe(1); // vue compartilhado continua
    expect([...w.store.keys()].sort()).toEqual([b1.f.path, b2.f.path, core1.f.path, shared.f.path].sort());
    expect(await damagedRecords(w.ports)).toEqual([]);
    await uninstallEntry('core', w.ports);
    expect(w.store.has(shared.f.path)).toBe(true); // o app b ainda usa
    await uninstallEntry('b', w.ports);
    expect(w.store.size).toBe(0);
  });

  it('falha de rede num arquivo desfaz só o que esta operação criou e mantém o que já havia', async () => {
    const w = world(contents);
    await run([core], w);
    w.state.fail.add(a2.f.path);
    await expect(run([appA], w)).rejects.toMatchObject({ kind: 'network' });
    expect([...w.store.keys()].sort()).toEqual([core1.f.path, shared.f.path].sort());
    expect((await w.ports.ledger.all()).map((r) => r.id)).toEqual(['core']);
    // tentar de novo funciona (recuperação)
    w.state.fail.clear();
    await run([appA], w);
    expect((await w.ports.ledger.all()).map((r) => r.id).sort()).toEqual(['a', 'core']);
  });

  it('arquivo corrompido (tamanho ou hash diferente) é recusado', async () => {
    const w = world(contents);
    w.state.corrupt.add(a2.f.path);
    await expect(run([appA], w)).rejects.toBeInstanceOf(InstallError);
    expect(w.store.size).toBe(0);
    expect(await w.ports.ledger.all()).toEqual([]);
    const sameSizeWrong = world({ ...contents, [a2.f.path]: 'X'.repeat(a2.f.bytes) });
    await expect(run([appA], sameSizeWrong)).rejects.toMatchObject({ kind: 'integrity' });
  });

  it('cancelar desfaz a operação inteira', async () => {
    const w = world(contents);
    const ctl = new AbortController();
    const p = installEntries([core, appA], w.ports, { signal: ctl.signal, onProgress: (x) => { if (x.filesDone >= 1) ctl.abort(); } });
    await expect(p).rejects.toMatchObject({ kind: 'cancelled' });
    expect(w.store.size).toBe(0);
    expect(await w.ports.ledger.all()).toEqual([]);
  });

  it('atualização: só baixa o que mudou, e depois remove os arquivos antigos', async () => {
    const w = world(contents);
    await run([core, appA], w);
    const a2new = await file('/assets/a-2.js', 'codigo NOVO do app a');
    const a1new = await file('/apps/a/index.html', '<html>a v2</html>');
    const appA2 = entry('a', [a1new.f, a2new.f, shared.f], 'v2');
    const w2contents = { ...contents, [a1new.f.path]: a1new.text, [a2new.f.path]: a2new.text };
    w.ports.fetch = world(w2contents).ports.fetch;
    const records = await w.ports.ledger.all();
    expect(updateAvailable(records.find((r) => r.id === 'a'), appA2)).toBe(true);
    expect(missingFiles([appA2], new Map(records.flatMap((r) => r.files.map((f) => [f.path, f.sha256] as const)))).map((f) => f.path).sort()).toEqual([a1new.f.path, a2new.f.path].sort());
    await run([appA2], w);
    expect(await pruneUnused(w.ports)).toBe(1); // /assets/a-1.js ficou órfão
    expect(w.store.has(a2.f.path)).toBe(false);
    expect(w.store.get(a1new.f.path)).toBe('<html>a v2</html>');
  });

  it('detecta cache apagado pelo navegador', async () => {
    const w = world(contents);
    await run([core, appA], w);
    w.store.delete(a2.f.path);
    expect(await damagedRecords(w.ports)).toEqual([{ id: 'a', missing: [a2.f.path] }]);
  });

  it('sem espaço no navegador: erro claro de cota e nada fica pela metade', async () => {
    const w = world(contents);
    const real = w.ports.cache.put;
    let n = 0;
    w.ports.cache.put = async (p, b, t) => { if (++n === 2) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } await real(p, b, t); };
    await expect(run([appA], w)).rejects.toMatchObject({ kind: 'quota' });
    expect(w.store.size).toBe(0);
  });
});
