import { KIND_LABELS, type ViewKind } from './kinds';
import type { ViewerFile } from './model';
import type { SortKey } from './prefs';

/** Ordem em que os tipos aparecem nos filtros da biblioteca. */
export const KIND_ORDER: readonly ViewKind[] = ['image', 'svg', 'video', 'audio', 'pdf', 'model', 'text', 'unknown'];

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

const norm = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Pesquisa por nome (sem diferenciar maiúsculas e acentos) ou pelo nome do tipo; `kinds` vazio = todos os tipos. */
export function filterFiles(files: readonly ViewerFile[], query: string, kinds: ReadonlySet<ViewKind>): ViewerFile[] {
  const q = norm(query.trim());
  return files.filter((f) => {
    if (kinds.size && !kinds.has(f.kind)) return false;
    if (!q) return true;
    return norm(f.name).includes(q) || norm(KIND_LABELS[f.kind]).includes(q);
  });
}

/** Ordena uma cópia da lista. "ordem" mantém a ordem do projeto (e só inverte quando pedido). */
export function sortFiles(files: readonly ViewerFile[], key: SortKey, desc: boolean): ViewerFile[] {
  const copy = files.slice();
  if (key === 'nome') copy.sort((a, b) => collator.compare(a.name, b.name));
  else if (key === 'formato') copy.sort((a, b) => collator.compare(KIND_LABELS[a.kind], KIND_LABELS[b.kind]) || collator.compare(a.name, b.name));
  else if (key === 'tamanho') copy.sort((a, b) => a.size - b.size || collator.compare(a.name, b.name));
  return desc ? copy.reverse() : copy;
}

/** Quantos arquivos há de cada tipo (só os tipos presentes). */
export function kindCounts(files: readonly ViewerFile[]): { kind: ViewKind; count: number }[] {
  const counts = new Map<ViewKind, number>();
  for (const f of files) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
  return KIND_ORDER.filter((k) => counts.has(k)).map((kind) => ({ kind, count: counts.get(kind)! }));
}

/** Nome de arquivo digitado pela pessoa: sem caracteres de controle nem barras, no máximo 160 letras. Vazio = inválido. */
export function cleanFileName(raw: string): string {
  return raw.replace(/[\u0000-\u001f\u007f/\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

/** Próximo item a ficar ativo depois de remover o de índice `index` (o seguinte; na falta, o anterior). */
export function neighborAfterRemoval(ids: readonly string[], index: number): string {
  if (ids.length <= 1) return '';
  return ids[index + 1] ?? ids[index - 1] ?? '';
}
