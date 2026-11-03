import { MAX_COPIES, MAX_ITEMS, uid, type LabelItem } from './model';

/** Linha interpretada da lista colada, com avisos sobre o que foi ajustado. */
export interface BulkRow { line: number; code: string; description: string; copies: number; notes: string[] }
export interface BulkParse { rows: BulkRow[]; ignored: number; totalLabels: number }

const MAX_CODE = 160;
const MAX_DESC = 2000;

/**
 * Mesmas regras do Coding atual: uma linha por item; colunas separadas por TAB (colado do Excel),
 * senão por ";", senão a linha inteira é o código. Descrição e cópias são opcionais.
 */
export function parseBulk(text: string): BulkParse {
  const rows: BulkRow[] = [];
  let ignored = 0;
  text.split(/\r?\n/).forEach((raw, index) => {
    if (!raw.trim()) return;
    const parts = (raw.includes('\t') ? raw.split('\t') : raw.includes(';') ? raw.split(';') : [raw]).map((s) => s.trim());
    const notes: string[] = [];
    let code = parts[0] ?? '';
    let description = parts[1] ?? '';
    if (!code && !description) { ignored += 1; return; }
    if (code.length > MAX_CODE) { code = code.slice(0, MAX_CODE); notes.push('código cortado em ' + MAX_CODE + ' caracteres'); }
    if (description.length > MAX_DESC) { description = description.slice(0, MAX_DESC); notes.push('descrição cortada em ' + MAX_DESC + ' caracteres'); }
    let copies = 1;
    const rawCopies = parts[2] ?? '';
    if (rawCopies) {
      const n = Number.parseInt(rawCopies, 10);
      if (!Number.isFinite(n)) notes.push('cópias "' + rawCopies + '" inválidas; usei 1');
      else if (n < 1) notes.push('cópias abaixo de 1; usei 1');
      else if (n > MAX_COPIES) { copies = MAX_COPIES; notes.push('cópias limitadas a ' + MAX_COPIES); }
      else copies = n;
    }
    if (parts.length > 3 && parts.slice(3).some(Boolean)) notes.push('colunas depois da 3ª ignoradas');
    rows.push({ line: index + 1, code, description, copies, notes });
  });
  return { rows, ignored, totalLabels: rows.reduce((sum, row) => sum + row.copies, 0) };
}

export interface BulkMerge { items: LabelItem[]; added: number; trimmed: boolean }

/** Junta as linhas aos itens atuais (itens vazios são descartados) respeitando o limite de itens. */
export function mergeBulk(current: readonly LabelItem[], rows: readonly BulkRow[], replace: boolean): BulkMerge {
  const base = replace ? [] : current.filter((item) => item.code.trim() || item.description.trim());
  const incoming = rows.map((row) => ({ id: uid(), code: row.code, description: row.description, copies: row.copies }));
  const merged = base.concat(incoming);
  const trimmed = merged.length > MAX_ITEMS;
  const items = merged.slice(0, MAX_ITEMS);
  return { items, added: Math.max(0, items.length - base.length), trimmed };
}
