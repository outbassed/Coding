import { tools, type ToolId } from './catalog';

/**
 * Registro central e tipado de versões do Coding Launcher e dos 16 aplicativos.
 *
 * - A versão principal (`MAJOR.MINOR.PATCH`, semver) só muda em um lançamento registrado em `versions-data.ts`.
 * - A compilação (`DD.MM.AA.HHMMSS`, fuso America/Sao_Paulo) identifica quando o pacote foi compilado.
 * - A data e a hora de lançamento (publicação) são campos próprios e independentes da compilação.
 *
 * Esta é a ÚNICA fonte de dados: Ajustes → Sobre, a página de Detalhes de cada app e a Central de Versões
 * (/versoes/) leem daqui.
 */

export type VersionTarget = 'launcher' | ToolId;

export const LAUNCHER_NAME = 'Coding Launcher';
export const VERSION_TIMEZONE = 'America/Sao_Paulo';

/** Ordem do menu da Central de Versões. */
export const TARGET_ORDER: readonly VersionTarget[] = [
  'launcher', 'labels', 'texts', 'calc', 'images', 'pdf', 'codes', 'draw', 'split',
  'calculator', 'colors', 'zip', 'compare', 'code', 'paint', 'viewer', 'versos'
];

export interface VersionRecord {
  target: VersionTarget;
  /** Semver `MAJOR.MINOR.PATCH`. */
  version: string;
  /** Compilação `DD.MM.AA.HHMMSS` (America/Sao_Paulo). */
  build: string;
  /** Data de lançamento (publicação) `AAAA-MM-DD` — independente da data da compilação. */
  releaseDate: string;
  /** Hora de lançamento `HH:MM:SS` (America/Sao_Paulo). */
  releaseTime: string;
  novidades?: readonly string[];
  melhorias?: readonly string[];
  correcoes?: readonly string[];
  alteracoesTecnicas?: readonly string[];
  problemasConhecidos?: readonly string[];
  commit?: string;
  prUrl?: string;
  notes?: string;
}

export const NOTE_SECTIONS = [
  { key: 'novidades', title: 'Novidades' },
  { key: 'melhorias', title: 'Melhorias' },
  { key: 'correcoes', title: 'Correções' },
  { key: 'alteracoesTecnicas', title: 'Alterações técnicas' },
  { key: 'problemasConhecidos', title: 'Problemas conhecidos' }
] as const;
export type NoteKey = (typeof NOTE_SECTIONS)[number]['key'];

/** Seções realmente preenchidas de um registro (as vazias não aparecem no modal). */
export function sectionsOf(record: VersionRecord): { key: NoteKey; title: string; items: readonly string[] }[] {
  return NOTE_SECTIONS
    .map((s) => ({ key: s.key, title: s.title, items: record[s.key] ?? [] }))
    .filter((s) => s.items.length > 0);
}

// ---------- alvos e endereços ----------

/** Pasta da página do app (`/apps/etiquetas/` → `etiquetas`). */
export function slugOf(target: VersionTarget): string {
  if (target === 'launcher') return 'launcher';
  const tool = tools.find((t) => t.id === target);
  const slug = tool?.path?.split('/').filter(Boolean)[1];
  if (!slug) throw new Error('App sem caminho no catálogo: ' + target);
  return slug;
}
export const allSlugs = (): string[] => TARGET_ORDER.map(slugOf);
export function targetFromSlug(slug: string): VersionTarget | null {
  return TARGET_ORDER.find((t) => slugOf(t) === slug) ?? null;
}
export function targetName(target: VersionTarget): string {
  if (target === 'launcher') return LAUNCHER_NAME;
  return tools.find((t) => t.id === target)?.name ?? target;
}
/** Endereço (com barra final) do histórico: o do Launcher é a raiz da Central. */
export function historyPath(target: VersionTarget): string {
  return target === 'launcher' ? '/versoes/' : '/versoes/' + slugOf(target) + '/';
}
export const VERSIONS_BASE = '/versoes/';

// ---------- formatos ----------

export const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const BUILD = /^(\d{2})\.(\d{2})\.(\d{2})\.(\d{2})(\d{2})(\d{2})$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{2}):(\d{2}):(\d{2})$/;

export const isSemver = (v: string): boolean => SEMVER.test(v);
const pad = (n: number, size = 2): string => String(n).padStart(size, '0');

function validDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function validTime(h: number, mi: number, s: number): boolean { return h <= 23 && mi <= 59 && s <= 59; }

/** Partes de data/hora de um instante no fuso de São Paulo. */
export function saoPauloParts(date: Date): { y: number; mo: number; d: number; h: number; mi: number; s: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: VERSION_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') };
}

/** Compilação `DD.MM.AA.HHMMSS` de um instante, sempre no fuso de São Paulo e com zeros à esquerda. */
export function buildStamp(date: Date = new Date()): string {
  const p = saoPauloParts(date);
  return pad(p.d) + '.' + pad(p.mo) + '.' + pad(p.y % 100) + '.' + pad(p.h) + pad(p.mi) + pad(p.s);
}

export interface ParsedBuild { date: string; time: string }
/** Decodifica uma compilação: devolve a data (AAAA-MM-DD) e a hora (HH:MM:SS) ou `null` se o formato ou o calendário forem inválidos. */
export function parseBuild(build: string): ParsedBuild | null {
  const m = BUILD.exec(build);
  if (!m) return null;
  const [d, mo, yy, h, mi, s] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  const y = 2000 + yy;
  if (!validDate(y, mo, d) || !validTime(h, mi, s)) return null;
  return { date: y + '-' + pad(mo) + '-' + pad(d), time: pad(h) + ':' + pad(mi) + ':' + pad(s) };
}

export function isValidReleaseDate(date: string): boolean {
  const m = DATE.exec(date);
  return !!m && validDate(Number(m[1]), Number(m[2]), Number(m[3]));
}
export function isValidReleaseTime(time: string): boolean {
  const m = TIME.exec(time);
  return !!m && validTime(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** `2026-10-25` + `22:54:30` → `25/10/2026 às 22:54:30`. */
export function formatDateTime(date: string, time: string): string {
  const m = DATE.exec(date);
  return m ? m[3] + '/' + m[2] + '/' + m[1] + ' às ' + time : date + ' às ' + time;
}
export const formatRelease = (r: VersionRecord): string => formatDateTime(r.releaseDate, r.releaseTime);
export function formatBuildDateTime(build: string): string {
  const p = parseBuild(build);
  return p ? formatDateTime(p.date, p.time) : build;
}

// ---------- ordenação e consulta ----------

export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] ?? 0) - (pb[i] ?? 0); if (d !== 0) return d; }
  return 0;
}
const releaseKey = (r: VersionRecord): string => r.releaseDate + 'T' + r.releaseTime;

/** Mais recente primeiro: por lançamento, depois por versão e por compilação. */
export function newestFirst(a: VersionRecord, b: VersionRecord): number {
  const byRelease = releaseKey(b).localeCompare(releaseKey(a));
  if (byRelease !== 0) return byRelease;
  const bySemver = compareSemver(b.version, a.version);
  if (bySemver !== 0) return bySemver;
  return (parseBuild(b.build)?.date ?? '').localeCompare(parseBuild(a.build)?.date ?? '');
}
export function recordsFor(target: VersionTarget, all: readonly VersionRecord[]): VersionRecord[] {
  return all.filter((r) => r.target === target).sort(newestFirst);
}
export const latestOf = (target: VersionTarget, all: readonly VersionRecord[]): VersionRecord | null => recordsFor(target, all)[0] ?? null;

/** Lista grande: devolve só a página pedida e quantos itens ainda faltam. */
export function pageOf<T>(list: readonly T[], shown: number): { items: T[]; remaining: number } {
  const items = list.slice(0, Math.max(0, shown));
  return { items, remaining: Math.max(0, list.length - items.length) };
}

/** Problemas encontrados no registro (vazio = registro válido). Usado pelos testes e útil ao adicionar versões. */
export function validateRecords(all: readonly VersionRecord[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const known = new Set<string>(TARGET_ORDER);
  for (const r of all) {
    const label = r.target + ' ' + r.version;
    if (!known.has(r.target)) errors.push(label + ': alvo desconhecido');
    if (!isSemver(r.version)) errors.push(label + ': versão fora do formato MAJOR.MINOR.PATCH');
    if (!parseBuild(r.build)) errors.push(label + ': compilação inválida (' + r.build + '), esperado DD.MM.AA.HHMMSS');
    if (!isValidReleaseDate(r.releaseDate)) errors.push(label + ': data de lançamento inválida (' + r.releaseDate + ')');
    if (!isValidReleaseTime(r.releaseTime)) errors.push(label + ': hora de lançamento inválida (' + r.releaseTime + ')');
    const b = parseBuild(r.build);
    if (b && isValidReleaseDate(r.releaseDate) && isValidReleaseTime(r.releaseTime) && (b.date + 'T' + b.time) > releaseKey(r)) errors.push(label + ': lançamento anterior à compilação');
    const key = r.target + '@' + r.version;
    if (seen.has(key)) errors.push(label + ': versão repetida');
    seen.add(key);
    if (!r.novidades?.length && !r.melhorias?.length && !r.correcoes?.length && !r.alteracoesTecnicas?.length && !r.problemasConhecidos?.length) errors.push(label + ': sem nenhuma nota');
    if (r.prUrl && !/^https:\/\//.test(r.prUrl)) errors.push(label + ': prUrl precisa ser https');
  }
  return errors;
}
