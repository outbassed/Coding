/**
 * Imagens de fundo: leitura/validação na importação e cache de bitmaps decodificados.
 *
 * O arquivo original é guardado como foi importado (Blob no IndexedDB, junto do documento; nunca um `blob:` URL).
 * Na tela usamos uma versão reduzida (até `previewSide` px) em um cache LRU pequeno, para suportar muitas cenas sem
 * guardar todas as fotos em tamanho cheio. Na exportação a imagem é decodificada no tamanho original, uma cena por vez.
 */
import type { ImageSourceLike } from './render';

export interface Decoded extends ImageSourceLike { close(): void }
export type Decoder = (blob: Blob, maxSide: number | null) => Promise<Decoded>;

/** Decodificador do navegador. `maxSide = null` → tamanho original. `width/height` sempre são os originais. */
export const browserDecode: Decoder = async (blob, maxSide) => {
  const full = await createImageBitmap(blob);
  const w = full.width, h = full.height;
  if (!maxSide || Math.max(w, h) <= maxSide) return { source: full, width: w, height: h, close: () => full.close() };
  const k = maxSide / Math.max(w, h);
  try {
    const small = await createImageBitmap(full, { resizeWidth: Math.max(1, Math.round(w * k)), resizeHeight: Math.max(1, Math.round(h * k)), resizeQuality: 'high' });
    full.close();
    return { source: small, width: w, height: h, close: () => small.close() };
  } catch {
    return { source: full, width: w, height: h, close: () => full.close() };
  }
};

export class ImageCache {
  private readonly ready = new Map<string, Decoded>();
  private readonly loading = new Map<string, Promise<void>>();
  private readonly failed = new Set<string>();
  private disposed = false;

  constructor(
    private readonly blobOf: (id: string) => Blob | undefined,
    private readonly onChange: () => void,
    private readonly decode: Decoder = browserDecode,
    private readonly maxEntries = 6,
    private readonly previewSide = 2048
  ) {}

  /** Imagem pronta para desenhar (ou null enquanto carrega / se falhou). Dispara a leitura quando preciso. */
  get(id: string): Decoded | null {
    const hit = this.ready.get(id);
    if (hit) { this.ready.delete(id); this.ready.set(id, hit); return hit; } // recente = fim do Map
    if (!this.loading.has(id) && !this.failed.has(id)) this.start(id);
    return null;
  }
  hasFailed(id: string): boolean { return this.failed.has(id); }
  isLoading(id: string): boolean { return this.loading.has(id); }
  size(): number { return this.ready.size; }

  private start(id: string): void {
    const blob = this.blobOf(id);
    if (!blob) return; // ainda não chegou (documento abrindo): tentamos de novo na próxima chamada
    const job = (async () => {
      try {
        const img = await this.decode(blob, this.previewSide);
        if (this.disposed) { img.close(); return; }
        this.ready.set(id, img);
        while (this.ready.size > this.maxEntries) {
          const [oldId, old] = this.ready.entries().next().value as [string, Decoded];
          this.ready.delete(oldId); old.close();
        }
      } catch { this.failed.add(id); }
      finally { this.loading.delete(id); this.onChange(); }
    })();
    this.loading.set(id, job);
  }
  /** Tamanho original (para exportar). Quem recebe deve chamar `close()`. */
  async loadFull(id: string): Promise<Decoded | null> {
    const blob = this.blobOf(id);
    if (!blob) return null;
    try { return await this.decode(blob, null); } catch { return null; }
  }
  /** Esquece uma imagem (arquivo trocado ou removido do projeto). */
  forget(id: string): void {
    const img = this.ready.get(id);
    if (img) { img.close(); this.ready.delete(id); }
    this.failed.delete(id);
  }
  clear(): void { for (const img of this.ready.values()) img.close(); this.ready.clear(); this.failed.clear(); }
  dispose(): void { this.disposed = true; this.clear(); }
}

export interface ReadImage { width: number; height: number }
/** Confere que o navegador consegue decodificar a imagem e devolve as dimensões. Lança com mensagem clara se não. */
export async function readImageFile(file: Blob, decode: Decoder = browserDecode): Promise<ReadImage> {
  try {
    const img = await decode(file, 64);
    const info = { width: img.width, height: img.height };
    img.close();
    if (!(info.width > 0 && info.height > 0)) throw new Error('vazia');
    return info;
  } catch {
    throw new Error('Não foi possível ler esta imagem. O arquivo pode estar corrompido ou ser de um formato que este navegador não abre (PNG, JPG, WebP e GIF funcionam).');
  }
}
