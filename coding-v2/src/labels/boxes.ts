import {
  DEFAULT_BOX_SHOPS, MAX_BLOCKS, normalizeShop,
  type BoxData, type BoxShop
} from './model';

/** O cadastro das lojas é local. Os documentos preservam cópias das lojas selecionadas. */
export const SHOP_KEY = 'coding-v2-labels-shops';
export const BOXES_PER_SHEET = 8;
export const shopsInitial = (): BoxShop[] => DEFAULT_BOX_SHOPS.map((shop) => ({ ...shop }));
export function readShops(store: Pick<Storage, 'getItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null): BoxShop[] {
  try {
    const raw = store?.getItem(SHOP_KEY);
    if (!raw) return shopsInitial();
    const parsed = JSON.parse(raw) as { v?: number; shops?: unknown };
    if (parsed?.v !== 1 || !Array.isArray(parsed.shops)) return shopsInitial();
    const found = new Set<string>();
    return parsed.shops.slice(0, 1000).flatMap((entry) => {
      const shop = normalizeShop(entry);
      if (!shop || found.has(shop.id)) return [];
      found.add(shop.id);
      return [shop];
    });
  } catch { return shopsInitial(); }
}
export function saveShops(shops: readonly BoxShop[], store: Pick<Storage, 'setItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null): boolean {
  try { store?.setItem(SHOP_KEY, JSON.stringify({ v: 1, shops })); return !!store; }
  catch { return false; }
}
export function shopHeading(boxes: BoxData): string { return boxes.stores.map((s) => s.short.toUpperCase()).join(' / '); }
export function boxPages(total: number): number[][] {
  const count = Math.max(1, Math.min(MAX_BLOCKS, Math.floor(total)));
  return Array.from({ length: Math.ceil(count / BOXES_PER_SHEET) }, (_, page) => {
    const start = page * BOXES_PER_SHEET + 1;
    return Array.from({ length: Math.min(BOXES_PER_SHEET, count - start + 1) }, (_, i) => start + i);
  });
}
export function validManual(boxes: BoxData): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(boxes.manualDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(boxes.manualTime)) return false;
  const [year, month, day] = boxes.manualDate.split('-').map(Number);
  const check = new Date(Date.UTC(year!, month! - 1, day!));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month! - 1 && check.getUTCDate() === day;
}
export function boxWarning(boxes: BoxData): string {
  if (!boxes.stores.length) return 'Selecione pelo menos uma loja.';
  if (!/^\d{1,24}$/.test(boxes.nf)) return 'A NF deve conter somente números.';
  if (!boxes.person.trim()) return 'Informe o nome.';
  if (!Number.isInteger(boxes.total) || boxes.total < 1 || boxes.total > MAX_BLOCKS) return 'Informe entre 1 e ' + MAX_BLOCKS + ' caixas.';
  if (boxes.timeMode === 'manual' && !validManual(boxes)) return 'Informe uma data e hora manuais válidas.';
  return '';
}
export function brasiliaStamp(date: Date): string {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const take = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return take('day') + '/' + take('month') + '/' + take('year') + ' ' + take('hour') + ':' + take('minute');
}
export function brasiliaFields(date: Date): { date: string; time: string } {
  const stamp = brasiliaStamp(date);
  return { date: stamp.slice(6, 10) + '-' + stamp.slice(3, 5) + '-' + stamp.slice(0, 2), time: stamp.slice(11) };
}
export function manualStamp(boxes: BoxData): string {
  return boxes.manualDate.slice(8, 10) + '/' + boxes.manualDate.slice(5, 7) + '/' + boxes.manualDate.slice(0, 4) + ' ' + boxes.manualTime;
}
export interface Stamped { text: string; source: 'online' | 'device' | 'manual' }
/** Consulta Date da própria hospedagem (sem enviar dados da NF); se falhar, usa o relógio do dispositivo. */
export async function stampForPrint(
  boxes: BoxData,
  fetcher: typeof fetch = fetch,
  deviceNow: () => Date = () => new Date()
): Promise<Stamped> {
  if (boxes.timeMode === 'manual') {
    if (!validManual(boxes)) throw new Error('Informe a data e a hora manuais.');
    return { text: manualStamp(boxes), source: 'manual' };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetcher('/brand/icon.svg', { method: 'HEAD', cache: 'no-store', signal: controller.signal });
    const serverDate = response.headers.get('date');
    if (response.ok && serverDate) {
      const online = new Date(serverDate);
      if (Number.isFinite(online.getTime())) return { text: brasiliaStamp(online), source: 'online' };
    }
  } catch { /* sem rede: relógio local */ }
  finally { clearTimeout(timeout); }
  return { text: brasiliaStamp(deviceNow()), source: 'device' };
}
