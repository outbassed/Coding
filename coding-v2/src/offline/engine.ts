import { InstallError, type InstalledRecord, type ManifestEntry, type ManifestFile, type Ports, type Progress } from './types';

const CONCURRENCY = 4;

/** Arquivos já guardados e registrados: caminho → hash. Só vale o que está no cache E em algum registro. */
export async function presentFiles(ports: Ports, records?: readonly InstalledRecord[]): Promise<Map<string, string>> {
  const recs = records ?? await ports.ledger.all();
  const cached = new Set(await ports.cache.keys());
  const present = new Map<string, string>();
  for (const r of recs) for (const f of r.files) if (cached.has(f.path)) present.set(f.path, f.sha256);
  return present;
}

/** Arquivos de um ou mais pacotes que ainda precisam ser baixados (ausentes ou com conteúdo diferente). */
export function missingFiles(entries: readonly ManifestEntry[], present: ReadonlyMap<string, string>): ManifestFile[] {
  const wanted = new Map<string, ManifestFile>();
  for (const e of entries) for (const f of e.files) wanted.set(f.path, f);
  return [...wanted.values()].filter((f) => present.get(f.path) !== f.sha256);
}
export const sumBytes = (files: readonly ManifestFile[]): number => files.reduce((n, f) => n + f.bytes, 0);

const isHtml = (p: string): boolean => p.endsWith('.html');
const contentTypeOf = (res: Response, path: string): string => {
  const given = res.headers.get('content-type');
  if (given) return given;
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  const map: Record<string, string> = { html: 'text/html; charset=utf-8', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', webmanifest: 'application/manifest+json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', woff: 'font/woff', woff2: 'font/woff2', ico: 'image/x-icon' };
  return map[ext] ?? 'application/octet-stream';
};

/** Baixa um arquivo contando os bytes reais recebidos; confere tamanho e SHA-256 contra o manifesto do build. */
async function download(file: ManifestFile, ports: Ports, signal: AbortSignal, onBytes: (n: number) => void): Promise<{ blob: Blob; type: string }> {
  let res: Response;
  try { res = await ports.fetch(file.path, signal); }
  catch (e) {
    if (signal.aborted) throw new InstallError('Instalação cancelada.', 'cancelled');
    throw new InstallError('Sem conexão ao baixar ' + file.path + '. Tente de novo.', 'network');
  }
  if (!res.ok) throw new InstallError('O servidor respondeu ' + res.status + ' ao baixar ' + file.path + '.', 'network');
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    if (res.body) {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); received += value.byteLength; onBytes(value.byteLength);
      }
    } else {
      const buf = new Uint8Array(await res.arrayBuffer());
      chunks.push(buf); received = buf.byteLength; onBytes(buf.byteLength);
    }
  } catch {
    if (signal.aborted) throw new InstallError('Instalação cancelada.', 'cancelled');
    throw new InstallError('A conexão caiu durante o download de ' + file.path + '.', 'network');
  }
  if (received !== file.bytes) throw new InstallError('O arquivo ' + file.path + ' veio com ' + received + ' bytes, mas o build registrou ' + file.bytes + '. Nada foi instalado desse arquivo.', 'integrity');
  const blob = new Blob(chunks as BlobPart[]);
  if (ports.sha256) {
    const digest = await ports.sha256(await blob.arrayBuffer());
    if (digest !== file.sha256) throw new InstallError('O arquivo ' + file.path + ' não confere com a verificação do build (SHA-256).', 'integrity');
  }
  return { blob, type: contentTypeOf(res, file.path) };
}

const quotaLike = (e: unknown): boolean => e instanceof Error && (e.name === 'QuotaExceededError' || /quota|space|storage/i.test(e.message));

export interface InstallOptions { signal: AbortSignal; onProgress?: (p: Progress) => void }

/**
 * Instala um ou mais pacotes (por exemplo, Núcleo + um app) baixando só o que falta.
 * - Arquivos que não são HTML vêm antes; as páginas HTML entram por último (nunca apontam para arquivo ausente).
 * - Se algo falhar ou for cancelado, os arquivos NOVOS desta operação são removidos (sem cache pela metade) e
 *   o que já estava instalado continua intacto.
 */
export async function installEntries(entries: readonly ManifestEntry[], ports: Ports, options: InstallOptions): Promise<InstalledRecord[]> {
  const records = await ports.ledger.all();
  const present = await presentFiles(ports, records);
  const todo = missingFiles(entries, present).sort((a, b) => Number(isHtml(a.path)) - Number(isHtml(b.path)) || a.path.localeCompare(b.path));
  const bytesTotal = sumBytes(todo);
  let bytesDone = 0, filesDone = 0, current = '';
  const emit = (): void => options.onProgress?.({ bytesDone, bytesTotal, filesDone, filesTotal: todo.length, current });
  emit();
  const added: string[] = [];
  const replaced = new Set(todo.filter((f) => present.has(f.path)).map((f) => f.path));
  try {
    const nonHtml = todo.filter((f) => !isHtml(f.path));
    const html = todo.filter((f) => isHtml(f.path));
    for (const group of [nonHtml, html]) {
      let next = 0;
      const worker = async (): Promise<void> => {
        for (;;) {
          if (options.signal.aborted) throw new InstallError('Instalação cancelada.', 'cancelled');
          const file = group[next++];
          if (!file) return;
          current = file.path;
          const got = await download(file, ports, options.signal, (n) => { bytesDone += n; emit(); });
          if (options.signal.aborted) throw new InstallError('Instalação cancelada.', 'cancelled');
          try { await ports.cache.put(file.path, got.blob, got.type); }
          catch (e) { throw new InstallError(quotaLike(e) ? 'O navegador não tem espaço para guardar os arquivos offline.' : 'Não foi possível gravar ' + file.path + ' no armazenamento do navegador.', quotaLike(e) ? 'quota' : 'other'); }
          if (!replaced.has(file.path)) added.push(file.path);
          filesDone++; emit();
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, group.length) }, worker));
    }
    // Conferência final: tudo o que cada pacote promete precisa estar no cache.
    const cached = new Set(await ports.cache.keys());
    for (const e of entries) for (const f of e.files) if (!cached.has(f.path)) throw new InstallError('O arquivo ' + f.path + ' não ficou guardado.', 'other');
    const now = Date.now();
    const out: InstalledRecord[] = entries.map((e) => ({ id: e.id, name: e.name, version: e.version, files: e.files.map((f) => ({ ...f })), bytes: e.bytes, installedAt: now }));
    for (const r of out) await ports.ledger.put(r);
    return out;
  } catch (error) {
    // Desfaz só o que esta operação criou e que nenhum pacote já instalado usa.
    const owned = new Set(records.flatMap((r) => r.files.map((f) => f.path)));
    for (const path of added) if (!owned.has(path)) { try { await ports.cache.remove(path); } catch { /* melhor esforço */ } }
    throw error instanceof InstallError ? error : new InstallError(error instanceof Error ? error.message : 'Falha na instalação.', 'other');
  }
}

/** Remove o pacote e apaga do cache apenas os arquivos que nenhum outro pacote instalado usa. Documentos nunca são tocados. */
export async function uninstallEntry(id: string, ports: Ports): Promise<{ removed: number; kept: number }> {
  const records = await ports.ledger.all();
  const target = records.find((r) => r.id === id);
  if (!target) return { removed: 0, kept: 0 };
  const rest = records.filter((r) => r.id !== id);
  await ports.ledger.remove(id);
  const stillUsed = new Set(rest.flatMap((r) => r.files.map((f) => f.path)));
  let removed = 0, kept = 0;
  for (const f of target.files) {
    if (stillUsed.has(f.path)) { kept++; continue; }
    try { await ports.cache.remove(f.path); removed++; } catch { /* já não existia */ }
  }
  return { removed, kept };
}

/** Depois de atualizar: apaga arquivos antigos que nenhum registro atual usa mais. */
export async function pruneUnused(ports: Ports): Promise<number> {
  const records = await ports.ledger.all();
  const used = new Set(records.flatMap((r) => r.files.map((f) => f.path)));
  let n = 0;
  for (const path of await ports.cache.keys()) if (!used.has(path)) { try { await ports.cache.remove(path); n++; } catch { /* ignora */ } }
  return n;
}

/** Pacotes registrados cujo cache perdeu arquivos (limpeza do navegador, por exemplo). */
export async function damagedRecords(ports: Ports): Promise<{ id: string; missing: string[] }[]> {
  const records = await ports.ledger.all();
  const cached = new Set(await ports.cache.keys());
  return records.map((r) => ({ id: r.id, missing: r.files.filter((f) => !cached.has(f.path)).map((f) => f.path) })).filter((x) => x.missing.length > 0);
}

export function updateAvailable(record: InstalledRecord | undefined, entry: ManifestEntry | undefined): boolean {
  return !!record && !!entry && record.version !== entry.version;
}

/** Resumo de tamanho para a interface: o que baixar agora, separando arquivos próprios dos já presentes. */
export function sizeSummary(entry: ManifestEntry, present: ReadonlyMap<string, string>): { total: number; toDownload: number; alreadyHave: number } {
  const need = sumBytes(missingFiles([entry], present));
  return { total: entry.bytes, toDownload: need, alreadyHave: entry.bytes - need };
}
