export interface ManifestFile { path: string; bytes: number; sha256: string }
export interface ManifestEntry {
  id: string;
  name: string;
  page: string;
  /** Resumo (hash) do conteúdo dos arquivos: muda quando qualquer arquivo do app muda. */
  version: string;
  /** Soma dos arquivos no disco (sem compressão de rede). */
  bytes: number;
  ownBytes?: number;
  sharedWithCoreBytes?: number;
  sharedWithAppsBytes?: number;
  files: ManifestFile[];
}
export interface OfflineManifest {
  schema: 1;
  build: string;
  note: string;
  core: ManifestEntry;
  apps: Record<string, ManifestEntry>;
}

/** Estados de instalação offline (independentes de o app estar ativado ou não no Launcher). */
export type InstallState = 'not-installed' | 'installing' | 'installed' | 'update-available' | 'updating' | 'failed';

/** O que ficou instalado de verdade neste navegador (guardado no banco `coding-v2-offline`, separado dos documentos). */
export interface InstalledRecord {
  id: string;
  name: string;
  version: string;
  files: ManifestFile[];
  bytes: number;
  installedAt: number;
}

export interface Progress { bytesDone: number; bytesTotal: number; filesDone: number; filesTotal: number; current: string }

/** Portas do mundo real (Cache API, banco local e rede), trocáveis nos testes. */
export interface CachePort {
  /** Caminhos guardados no cache. */
  keys(): Promise<string[]>;
  put(path: string, body: Blob, contentType: string): Promise<void>;
  remove(path: string): Promise<void>;
}
export interface LedgerPort {
  all(): Promise<InstalledRecord[]>;
  put(record: InstalledRecord): Promise<void>;
  remove(id: string): Promise<void>;
}
export type FetchPort = (path: string, signal: AbortSignal) => Promise<Response>;
export interface Ports { cache: CachePort; ledger: LedgerPort; fetch: FetchPort; sha256?: (data: ArrayBuffer) => Promise<string> }

export class InstallError extends Error {
  constructor(message: string, readonly kind: 'network' | 'integrity' | 'quota' | 'cancelled' | 'unsupported' | 'other' = 'other') { super(message); this.name = 'InstallError'; }
}
