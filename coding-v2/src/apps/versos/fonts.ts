/**
 * Fontes do Versos.
 *
 * Não existe (ainda) um sistema global de fontes no Coding. Este módulo é o adaptador local e o ponto de
 * integração futuro com o app "Coding Fontes": basta registrar um `FontProvider` com `registerFontProvider`
 * que ele passa a aparecer no seletor, ser carregado sem bloquear a interface e entrar na exportação.
 *
 * Regras:
 *  - Só fontes livres e redistribuíveis (todas SIL OFL 1.1; os avisos ficam em /fonts/versos/<família>/OFL.txt).
 *    Arial e outras proprietárias NÃO são incluídas. A fonte substituta é a Arimo (métricas compatíveis com a Arial).
 *  - O projeto guarda a identificação ORIGINAL da fonte (`{id, label}`). Se ela não existir neste aparelho,
 *    só a exibição usa a Arimo; o que está salvo no projeto nunca é sobrescrito.
 *  - Nada é baixado de fora: os arquivos vêm do próprio app e entram no pacote offline.
 *  - Os caminhos abaixo são literais de propósito: o gerador do pacote offline os encontra no código compilado.
 */
import type { FontRef } from './model';

export type FontCategory = 'sans' | 'serif' | 'display' | 'script' | 'handwriting';
export const CATEGORY_LABEL: Record<FontCategory, string> = { sans: 'Sem serifa', serif: 'Serifada', display: 'Impacto', script: 'Cursiva', handwriting: 'Manuscrita' };

export interface FontFamilyDef {
  id: string;
  label: string;
  category: FontCategory;
  /** Intervalo de pesos suportado (fonte variável) ou [400, 400] para fonte de peso único. */
  weights: readonly [number, number];
  files: { normal: string; italic?: string };
  license: 'OFL-1.1';
  licenseFile: string;
  /** Origem pública do desenho (informativo, usado nos créditos). */
  source: string;
  author: string;
}

const OFL = 'SIL Open Font License 1.1';
export const FONT_FAMILIES: readonly FontFamilyDef[] = [
  { id: 'arimo', label: 'Arimo', category: 'sans', weights: [400, 700], files: { normal: '/fonts/versos/arimo/arimo-regular.woff', italic: '/fonts/versos/arimo/arimo-italic.woff' }, license: 'OFL-1.1', licenseFile: '/fonts/versos/arimo/OFL.txt', source: 'https://fonts.google.com/specimen/Arimo', author: 'Steve Matteson' },
  { id: 'montserrat', label: 'Montserrat', category: 'sans', weights: [100, 900], files: { normal: '/fonts/versos/montserrat/montserrat-regular.woff', italic: '/fonts/versos/montserrat/montserrat-italic.woff' }, license: 'OFL-1.1', licenseFile: '/fonts/versos/montserrat/OFL.txt', source: 'https://fonts.google.com/specimen/Montserrat', author: 'The Montserrat Project Authors' },
  { id: 'oswald', label: 'Oswald', category: 'sans', weights: [200, 700], files: { normal: '/fonts/versos/oswald/oswald-regular.woff' }, license: 'OFL-1.1', licenseFile: '/fonts/versos/oswald/OFL.txt', source: 'https://fonts.google.com/specimen/Oswald', author: 'The Oswald Project Authors' },
  { id: 'playfair-display', label: 'Playfair Display', category: 'serif', weights: [400, 900], files: { normal: '/fonts/versos/playfair-display/playfair-display-regular.woff', italic: '/fonts/versos/playfair-display/playfair-display-italic.woff' }, license: 'OFL-1.1', licenseFile: '/fonts/versos/playfair-display/OFL.txt', source: 'https://fonts.google.com/specimen/Playfair+Display', author: 'The Playfair Display Project Authors' },
  { id: 'cormorant-garamond', label: 'Cormorant Garamond', category: 'serif', weights: [300, 700], files: { normal: '/fonts/versos/cormorant-garamond/cormorant-garamond-regular.woff', italic: '/fonts/versos/cormorant-garamond/cormorant-garamond-italic.woff' }, license: 'OFL-1.1', licenseFile: '/fonts/versos/cormorant-garamond/OFL.txt', source: 'https://fonts.google.com/specimen/Cormorant+Garamond', author: 'Christian Thalmann' },
  { id: 'lora', label: 'Lora', category: 'serif', weights: [400, 700], files: { normal: '/fonts/versos/lora/lora-regular.woff', italic: '/fonts/versos/lora/lora-italic.woff' }, license: 'OFL-1.1', licenseFile: '/fonts/versos/lora/OFL.txt', source: 'https://fonts.google.com/specimen/Lora', author: 'Cyreal' },
  { id: 'bebas-neue', label: 'Bebas Neue', category: 'display', weights: [400, 400], files: { normal: '/fonts/versos/bebas-neue/bebas-neue-regular.woff' }, license: 'OFL-1.1', licenseFile: '/fonts/versos/bebas-neue/OFL.txt', source: 'https://fonts.google.com/specimen/Bebas+Neue', author: 'Ryoichi Tsunekawa' },
  { id: 'anton', label: 'Anton', category: 'display', weights: [400, 400], files: { normal: '/fonts/versos/anton/anton-regular.woff' }, license: 'OFL-1.1', licenseFile: '/fonts/versos/anton/OFL.txt', source: 'https://fonts.google.com/specimen/Anton', author: 'Vernon Adams' },
  { id: 'great-vibes', label: 'Great Vibes', category: 'script', weights: [400, 400], files: { normal: '/fonts/versos/great-vibes/great-vibes-regular.woff' }, license: 'OFL-1.1', licenseFile: '/fonts/versos/great-vibes/OFL.txt', source: 'https://fonts.google.com/specimen/Great+Vibes', author: 'Robert Leuschke' },
  { id: 'dancing-script', label: 'Dancing Script', category: 'script', weights: [400, 700], files: { normal: '/fonts/versos/dancing-script/dancing-script-regular.woff' }, license: 'OFL-1.1', licenseFile: '/fonts/versos/dancing-script/OFL.txt', source: 'https://fonts.google.com/specimen/Dancing+Script', author: 'Impallari Type' },
  { id: 'pacifico', label: 'Pacifico', category: 'script', weights: [400, 400], files: { normal: '/fonts/versos/pacifico/pacifico-regular.woff' }, license: 'OFL-1.1', licenseFile: '/fonts/versos/pacifico/OFL.txt', source: 'https://fonts.google.com/specimen/Pacifico', author: 'Vernon Adams' },
  { id: 'caveat', label: 'Caveat', category: 'handwriting', weights: [400, 700], files: { normal: '/fonts/versos/caveat/caveat-regular.woff' }, license: 'OFL-1.1', licenseFile: '/fonts/versos/caveat/OFL.txt', source: 'https://fonts.google.com/specimen/Caveat', author: 'Impallari Type' }
];
export const FONT_LICENSE_NAME = OFL;
export const FALLBACK_FAMILY_ID = 'arimo';
/** Pilha usada quando a fonte pedida não está disponível: Arimo (livre) e equivalentes métricos locais. */
export const FALLBACK_STACK = 'Arimo, "Liberation Sans", Arial, Helvetica, sans-serif';

// ---------- provedores (ponto de integração com o futuro "Coding Fontes") ----------

export interface FontProvider {
  id: string;
  label: string;
  /** Famílias oferecidas por este provedor. */
  families(): readonly FontFamilyDef[];
}
const builtin: FontProvider = { id: 'coding-versos', label: 'Incluídas no Versos', families: () => FONT_FAMILIES };
const providers: FontProvider[] = [builtin];

export function registerFontProvider(provider: FontProvider): () => void {
  if (!providers.includes(provider)) providers.push(provider);
  notify();
  return () => { const i = providers.indexOf(provider); if (i > 0) providers.splice(i, 1); notify(); };
}
export function allFamilies(): FontFamilyDef[] {
  const seen = new Set<string>();
  const out: FontFamilyDef[] = [];
  for (const p of providers) for (const f of p.families()) if (!seen.has(f.id)) { seen.add(f.id); out.push(f); }
  return out;
}
export function findFamily(ref: FontRef): FontFamilyDef | null {
  const list = allFamilies();
  const id = ref.id.trim().toLowerCase(), label = ref.label.trim().toLowerCase();
  return list.find((f) => f.id === id) ?? list.find((f) => f.label.toLowerCase() === label || f.label.toLowerCase() === id) ?? null;
}

// ---------- resolução (nunca altera o que está salvo) ----------

export interface ResolvedFont {
  /** Família do catálogo, ou null quando a fonte não é uma das incluídas. */
  def: FontFamilyDef | null;
  /** A fonte escolhida não é uma das incluídas (a exibição usa uma substituta visual). */
  substituted: boolean;
  /** Valor para `font-family` / `ctx.font`. */
  css: string;
}
const quote = (name: string): string => '"' + name.replace(/["\\]/g, '') + '"';
export const faceName = (def: FontFamilyDef): string => 'vs-' + def.id;

export function resolveFont(ref: FontRef): ResolvedFont {
  const def = findFamily(ref);
  if (def) return { def, substituted: false, css: quote(faceName(def)) + ', ' + FALLBACK_STACK };
  // Fonte desconhecida: tentamos o nome original (pode existir neste aparelho) e caímos na Arimo.
  const name = ref.label.trim() || ref.id.trim();
  return { def: null, substituted: true, css: (name ? quote(name) + ', ' : '') + FALLBACK_STACK };
}
const clamp = (n: number, a: number, b: number): number => Math.min(b, Math.max(a, n));
export function supportedWeights(def: FontFamilyDef | null): number[] {
  if (!def) return [100, 200, 300, 400, 500, 600, 700, 800, 900];
  const out: number[] = [];
  for (let w = Math.ceil(def.weights[0] / 100) * 100; w <= def.weights[1]; w += 100) out.push(w);
  return out.length ? out : [def.weights[0]];
}
export const supportsWeight = (def: FontFamilyDef | null): boolean => !def || def.weights[0] !== def.weights[1];
export const supportsItalic = (def: FontFamilyDef | null): boolean => !def || !!def.files.italic;
/** Peso/itálico efetivamente desenhados (o salvo continua intacto; só evita negrito/itálico “falsos”). */
export function effectiveFace(ref: FontRef, weight: number, italic: boolean): { weight: number; italic: boolean } {
  const { def } = resolveFont(ref);
  if (!def) return { weight, italic };
  return { weight: clamp(weight, def.weights[0], def.weights[1]), italic: italic && !!def.files.italic };
}
/** Valor de `ctx.font` / CSS `font` para um texto. */
export function cssFont(ref: FontRef, size: number, weight: number, italic: boolean): string {
  const face = effectiveFace(ref, weight, italic);
  return (face.italic ? 'italic ' : '') + face.weight + ' ' + size + 'px ' + resolveFont(ref).css;
}

// ---------- carregamento (assíncrono, sem travar a interface) ----------

export type FontStatus = 'idle' | 'loading' | 'ready' | 'error';
const status = new Map<string, FontStatus>();
const pending = new Map<string, Promise<boolean>>();
const listeners = new Set<() => void>();
function notify(): void { for (const l of [...listeners]) l(); }
/** Chamado sempre que uma fonte termina de carregar (para redesenhar a prévia). */
export function onFontsChange(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function fontStatus(ref: FontRef): FontStatus {
  const { def } = resolveFont(ref);
  return def ? status.get(def.id) ?? 'idle' : 'ready';
}

function canLoad(): boolean { return typeof document !== 'undefined' && typeof FontFace !== 'undefined' && !!document.fonts; }

async function loadFace(def: FontFamilyDef, url: string, italic: boolean): Promise<void> {
  const weight = def.weights[0] === def.weights[1] ? String(def.weights[0]) : def.weights[0] + ' ' + def.weights[1];
  const face = new FontFace(faceName(def), 'url("' + url + '") format("woff")', { weight, style: italic ? 'italic' : 'normal', display: 'swap' });
  await face.load();
  document.fonts.add(face);
}
/** Carrega a família (normal e itálico, quando houver). Resolve `true` se pronta; nunca rejeita. */
export function loadFamily(def: FontFamilyDef): Promise<boolean> {
  const hit = pending.get(def.id);
  if (hit) return hit;
  if (!canLoad()) return Promise.resolve(false);
  status.set(def.id, 'loading');
  const job = (async () => {
    try {
      await loadFace(def, def.files.normal, false);
      if (def.files.italic) await loadFace(def, def.files.italic, true).catch(() => undefined);
      status.set(def.id, 'ready');
      return true;
    } catch {
      status.set(def.id, 'error');
      pending.delete(def.id); // permite tentar de novo mais tarde (ex.: voltou a rede)
      return false;
    } finally { notify(); }
  })();
  pending.set(def.id, job);
  return job;
}
/** Dispara o carregamento das fontes usadas, sem esperar. */
export function preloadFonts(refs: readonly FontRef[]): void {
  const seen = new Set<string>();
  for (const ref of refs) {
    const { def } = resolveFont(ref);
    if (def && !seen.has(def.id)) { seen.add(def.id); void loadFamily(def); }
  }
}
/** Espera as fontes usadas (para exportar com a fonte certa). Fontes com erro caem na substituta, sem travar. */
export async function ensureFonts(refs: readonly FontRef[]): Promise<{ missing: string[] }> {
  const missing: string[] = [];
  const seen = new Set<string>();
  const jobs: Promise<unknown>[] = [];
  for (const ref of refs) {
    const { def, substituted } = resolveFont(ref);
    const key = def ? def.id : 'x:' + ref.label;
    if (seen.has(key)) continue;
    seen.add(key);
    if (def) jobs.push(loadFamily(def).then((ok) => { if (!ok) missing.push(ref.label); }));
    else if (substituted) missing.push(ref.label);
  }
  await Promise.all(jobs);
  if (canLoad()) { try { await document.fonts.ready; } catch { /* ignora */ } }
  return { missing: [...new Set(missing)] };
}
/** Só para testes. */
export function __resetFontsForTests(): void { status.clear(); pending.clear(); listeners.clear(); providers.length = 1; }
