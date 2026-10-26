import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { damagedRecords, installEntries, missingFiles, pruneUnused, sumBytes, uninstallEntry, updateAvailable } from '../offline/engine';
import { browserPorts, CACHE_NAME, fetchManifest } from '../offline/ports';
import { InstallError, type InstallState, type InstalledRecord, type ManifestEntry, type OfflineManifest, type Ports, type Progress } from '../offline/types';
import { offlineSupport, registerOfflineWorker, unregisterOfflineWorker } from '../pwa';
import { friendlyInstallError } from '../offline/messages';

export interface Job { kind: 'install' | 'update'; ids: string[]; progress: Progress | null }

/**
 * Instalação offline por app. É um conceito SEPARADO da instalação
 * como aplicativo no aparelho (PWA). Desinstalar aqui nunca toca em documentos, backups ou configurações.
 */
export const useOfflineStore = defineStore('offline', () => {
  const support = offlineSupport();
  const supported = ref(support.ok);
  const reason = ref(support.ok ? '' : support.reason);
  const manifest = ref<OfflineManifest | null>(null);
  const manifestError = ref('');
  const records = ref<Record<string, InstalledRecord>>({});
  const damaged = ref<Record<string, string[]>>({});
  const errors = ref<Record<string, string>>({});
  const job = ref<Job | null>(null);
  const loaded = ref(false);
  let ports: Ports | null = null;
  let controller: AbortController | null = null;
  const getPorts = (): Ports => (ports ??= browserPorts());

  const entryOf = (id: string): ManifestEntry | undefined => (id === 'core' ? manifest.value?.core : manifest.value?.apps[id]);
  const installedIds = computed(() => Object.keys(records.value));
  const installedApps = computed(() => installedIds.value.filter((id) => id !== 'core'));
  const presentMap = computed(() => new Map(Object.values(records.value).flatMap((r) => r.files.map((f) => [f.path, f.sha256] as const))));

  function stateOf(id: string): InstallState {
    if (job.value?.ids.includes(id)) return job.value.kind === 'update' ? 'updating' : 'installing';
    if (errors.value[id]) return 'failed';
    const rec = records.value[id];
    if (!rec) return 'not-installed';
    if ((damaged.value[id]?.length ?? 0) > 0) return 'failed';
    return updateAvailable(rec, entryOf(id)) ? 'update-available' : 'installed';
  }
  const anyUpdate = computed(() => installedIds.value.some((id) => updateAvailable(records.value[id], entryOf(id))));

  /** O que seria baixado agora para instalar este app (inclui o Núcleo se ainda não estiver instalado). */
  function plan(id: string): { toDownload: number; ownBytes: number; includesCore: boolean; coreBytes: number } | null {
    const entry = entryOf(id);
    const core = manifest.value?.core;
    if (!entry || !core) return null;
    const includesCore = id !== 'core' && !records.value['core'];
    const list = includesCore ? [core, entry] : [entry];
    return { toDownload: sumBytes(missingFiles(list, presentMap.value)), ownBytes: entry.ownBytes ?? entry.bytes, includesCore, coreBytes: core.bytes };
  }

  async function refreshRecords(): Promise<void> {
    const p = getPorts();
    const list = await p.ledger.all();
    records.value = Object.fromEntries(list.map((r) => [r.id, r]));
    damaged.value = Object.fromEntries((await damagedRecords(p)).map((d) => [d.id, d.missing]));
  }
  async function init(): Promise<void> {
    if (!supported.value || loaded.value) return;
    loaded.value = true;
    try { await refreshRecords(); } catch { reason.value = 'Não foi possível ler o registro de instalações deste navegador.'; supported.value = false; return; }
    await loadManifest();
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !job.value) void refreshRecords().catch(() => undefined); });
  }
  async function loadManifest(): Promise<void> {
    manifestError.value = '';
    try { manifest.value = await fetchManifest(); }
    catch { manifest.value = null; manifestError.value = typeof navigator !== 'undefined' && navigator.onLine === false ? 'Sem conexão: não dá para saber se há atualizações nem baixar novos apps agora. O que já está instalado continua funcionando.' : 'Não foi possível ler a lista de arquivos desta versão. Tente de novo.'; }
  }

  async function run(kind: Job['kind'], ids: string[], entries: ManifestEntry[]): Promise<boolean> {
    if (job.value) return false;
    const p = getPorts();
    controller = new AbortController();
    job.value = { kind, ids, progress: null };
    for (const id of ids) delete errors.value[id];
    try {
      await registerOfflineWorker();
      await installEntries(entries, p, { signal: controller.signal, onProgress: (progress) => { if (job.value) job.value = { ...job.value, progress }; } });
      if (kind === 'update') await pruneUnused(p);
      await refreshRecords();
      return true;
    } catch (e) {
      const err = e instanceof InstallError ? e : new InstallError(e instanceof Error ? e.message : 'Falha na instalação.');
      if (err.kind !== 'cancelled') for (const id of ids) errors.value[id] = friendlyInstallError(err);
      await refreshRecords().catch(() => undefined);
      return false;
    } finally { job.value = null; controller = null; }
  }

  async function install(id: string): Promise<boolean> {
    const entry = entryOf(id); const core = manifest.value?.core;
    if (!entry || !core) return false;
    const withCore = id !== 'core' && !records.value['core'];
    return run('install', withCore ? ['core', id] : [id], withCore ? [core, entry] : [entry]);
  }
  /** Atualiza tudo o que está instalado de uma vez: os apps compartilham arquivos, então a versão precisa ser única. */
  async function updateAll(): Promise<boolean> {
    if (!manifest.value) return false;
    const all = installedIds.value.map((id) => entryOf(id)).filter((e): e is ManifestEntry => !!e);
    return run('update', installedIds.value, all);
  }
  function cancel(): void { controller?.abort(); }
  async function uninstall(id: string): Promise<boolean> {
    if (job.value) return false;
    if (id === 'core' && installedApps.value.length) return false;
    const p = getPorts();
    await uninstallEntry(id, p);
    delete errors.value[id];
    await refreshRecords();
    if (!Object.keys(records.value).length) {
      // Nada mais instalado: limpa o cache e solta o service worker (documentos não são afetados).
      try { await caches.delete(CACHE_NAME); } catch { /* sem cache */ }
      await unregisterOfflineWorker();
    }
    return true;
  }
  /** Tenta de novo depois de falha: reinstala só o que falta. */
  async function retry(id: string): Promise<boolean> {
    delete errors.value[id];
    const rec = records.value[id];
    if (rec && (damaged.value[id]?.length ?? 0) > 0) {
      const entry = entryOf(id);
      return entry ? run('install', [id], [entry]) : false;
    }
    return install(id);
  }

  return { supported, reason, manifest, manifestError, records, damaged, errors, job, loaded, installedIds, installedApps, anyUpdate, stateOf, plan, init, loadManifest, install, updateAll, cancel, uninstall, retry, entryOf, presentMap };
});

