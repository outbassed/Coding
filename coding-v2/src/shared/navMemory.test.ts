import { describe, expect, it } from 'vitest';
import {
  NAV_KEY, SESSION_TTL_MS, decideResume, isBackToLauncher, isColdEntry, isFresh, isPhone, launcherTarget, normalizeTarget, originLabel,
  parseRecord, readFresh, resolveOrigin, touch, type NavRecord
} from './navMemory';
import { tools } from './catalog';

const MIN = 60_000;
class MemoryStore {
  private data = new Map<string, string>();
  getItem(k: string): string | null { return this.data.get(k) ?? null; }
  setItem(k: string, v: string): void { this.data.set(k, v); }
  removeItem(k: string): void { this.data.delete(k); }
}
const T0 = 1_800_000_000_000;

describe('normalizeTarget · lista fechada de endereços internos', () => {
  it('aceita as telas do Launcher e os detalhes de cada um dos 16 aplicativos', () => {
    for (const route of ['/', '/meus-apps', '/catalogo', '/documentos', '/ajustes']) expect(normalizeTarget('/launcher/#' + route)?.url).toBe('/launcher/#' + route);
    expect(normalizeTarget('/launcher/')?.url).toBe('/launcher/#/');
    const withPath = tools.filter((t) => t.path);
    expect(withPath).toHaveLength(16);
    for (const t of withPath) {
      expect(normalizeTarget('/launcher/#/app/' + t.id)?.kind).toBe('launcher');
      expect(normalizeTarget(t.path!)).toEqual({ kind: 'app', url: t.path!, doc: null });
    }
  });
  it('mantém só o id do documento e descarta o resto da consulta', () => {
    expect(normalizeTarget('/apps/etiquetas/?doc=abc-123&x=1')).toEqual({ kind: 'app', url: '/apps/etiquetas/?doc=abc-123', doc: 'abc-123' });
    expect(normalizeTarget('/apps/texto/?modelo=carta')?.url).toBe('/apps/texto/');
    expect(normalizeTarget('/apps/texto/?doc=' + encodeURIComponent('<script>'))?.url).toBe('/apps/texto/');
  });
  it('recusa outro site, esquemas estranhos, rotas e aplicativos inexistentes', () => {
    for (const bad of ['https://evil.example/', '//evil.example/launcher/', 'javascript:alert(1)', '/launcher/#/app/nao-existe', '/launcher/#/qualquer', '/apps/nao-existe/',
      '/apps/etiquetas', '/versoes/', '/launcher/x/#/', '\\\\evil', '/launcher/\n#/', '', null, 42, undefined, '/' + 'a'.repeat(500)]) {
      expect(normalizeTarget(bad as unknown), String(bad)).toBeNull();
    }
    expect(launcherTarget('/apps/etiquetas/')).toBeNull();
  });
});

describe('registro · 20 minutos de inatividade', () => {
  it('vale em 1, 5 e 19 minutos e vence aos 20', () => {
    for (const m of [0, 1, 5, 19]) expect(isFresh(T0, T0 + m * MIN), m + ' min').toBe(true);
    expect(isFresh(T0, T0 + 19 * MIN + 59_999)).toBe(true);
    expect(isFresh(T0, T0 + 20 * MIN)).toBe(false);
    expect(isFresh(T0, T0 + 3 * 60 * MIN)).toBe(false);
  });
  it('relógio muito adiantado no registro também não vale', () => {
    expect(isFresh(T0 + 21 * MIN, T0)).toBe(false);
    expect(isFresh(T0 + 5_000, T0)).toBe(true);
  });
  it('parseRecord ignora lixo e filtra endereços inválidos', () => {
    expect(parseRecord(null)).toBeNull();
    expect(parseRecord('não é json')).toBeNull();
    expect(parseRecord(JSON.stringify({ v: 2, at: T0 }))).toBeNull();
    expect(parseRecord(JSON.stringify({ v: 1, at: 'x' }))).toBeNull();
    expect(parseRecord(JSON.stringify({ v: 1, at: T0, here: 'https://evil.example/', origin: '/apps/texto/' }))).toEqual({ at: T0, here: null, origin: null });
    expect(parseRecord(JSON.stringify({ v: 1, at: T0, here: '/apps/texto/?doc=a1', origin: '/launcher/#/catalogo' }))).toEqual({ at: T0, here: '/apps/texto/?doc=a1', origin: '/launcher/#/catalogo' });
  });
  it('touch grava a atividade e preserva a origem enquanto vale', () => {
    const store = new MemoryStore();
    touch(T0, { here: '/launcher/#/catalogo', origin: '/launcher/#/meus-apps' }, store);
    touch(T0 + 5 * MIN, { here: '/apps/etiquetas/?doc=d1' }, store);
    expect(readFresh(T0 + 5 * MIN, store)).toEqual({ at: T0 + 5 * MIN, here: '/apps/etiquetas/?doc=d1', origin: '/launcher/#/meus-apps' });
  });
  it('o tempo conta a partir da ÚLTIMA atividade, não da abertura', () => {
    const store = new MemoryStore();
    touch(T0, { here: '/launcher/#/catalogo' }, store);
    touch(T0 + 15 * MIN, {}, store); // mexeu aos 15 min
    expect(readFresh(T0 + 30 * MIN, store)).not.toBeNull(); // 15 min depois da última atividade
    expect(readFresh(T0 + 36 * MIN, store)).toBeNull();
  });
  it('registro vencido é descartado por inteiro, inclusive a origem antiga', () => {
    const store = new MemoryStore();
    touch(T0, { here: '/apps/texto/', origin: '/launcher/#/catalogo' }, store);
    touch(T0 + 25 * MIN, { here: '/launcher/#/' }, store);
    expect(readFresh(T0 + 25 * MIN, store)).toEqual({ at: T0 + 25 * MIN, here: '/launcher/#/', origin: null });
  });
  it('endereço inválido nunca é gravado e armazenamento quebrado não derruba nada', () => {
    const store = new MemoryStore();
    touch(T0, { here: '/launcher/#/ok' }, store);
    touch(T0 + 1, { here: 'https://evil.example/' }, store);
    expect(parseRecord(store.getItem(NAV_KEY))?.here).toBeNull();
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    expect(() => touch(T0, { here: '/launcher/#/' }, broken)).not.toThrow();
    expect(readFresh(T0, broken)).toBeNull();
  });
});

describe('decideResume · retomada no celular', () => {
  const rec = (here: string | null, at = T0): NavRecord => ({ at, here, origin: null });
  const ctx = (extra: Partial<Parameters<typeof decideResume>[1]> = {}) => ({ now: T0 + 5 * MIN, phone: true, coldEntry: true, explicit: false, ...extra });
  it('volta ao aplicativo, ao documento e às telas do Launcher', () => {
    expect(decideResume(rec('/apps/etiquetas/?doc=d1'), ctx())).toBe('/apps/etiquetas/?doc=d1');
    expect(decideResume(rec('/launcher/#/catalogo'), ctx())).toBe('/launcher/#/catalogo');
    expect(decideResume(rec('/launcher/#/meus-apps'), ctx())).toBe('/launcher/#/meus-apps');
    expect(decideResume(rec('/launcher/#/app/viewer'), ctx())).toBe('/launcher/#/app/viewer');
  });
  it('só em celular, entrada fria e sem endereço pedido', () => {
    const r = rec('/apps/etiquetas/?doc=d1');
    expect(decideResume(r, ctx({ phone: false }))).toBeNull();
    expect(decideResume(r, ctx({ coldEntry: false }))).toBeNull();
    expect(decideResume(r, ctx({ explicit: true }))).toBeNull();
  });
  it('1, 5 e 19 minutos retomam; 20 não', () => {
    for (const m of [1, 5, 19]) expect(decideResume(rec('/apps/zip/'), ctx({ now: T0 + m * MIN })), m + ' min').toBe('/apps/zip/');
    expect(decideResume(rec('/apps/zip/'), ctx({ now: T0 + SESSION_TTL_MS }))).toBeNull();
  });
  it('sem registro, sem tela, no Início ou com endereço inválido abre normalmente', () => {
    expect(decideResume(null, ctx())).toBeNull();
    expect(decideResume(rec(null), ctx())).toBeNull();
    expect(decideResume(rec('/launcher/#/'), ctx())).toBeNull();
    expect(decideResume({ at: T0, here: 'https://evil.example/', origin: null }, ctx())).toBeNull();
  });
  it('isColdEntry: só navegação nova, sem página anterior (ou vinda da tela de abertura)', () => {
    expect(isColdEntry('navigate', '')).toBe(true);
    expect(isColdEntry(undefined, '')).toBe(true);
    expect(isColdEntry('navigate', location.origin + '/')).toBe(true);
    expect(isColdEntry('reload', '')).toBe(false);
    expect(isColdEntry('back_forward', '')).toBe(false);
    expect(isColdEntry('navigate', location.origin + '/apps/texto/')).toBe(false); // clicou em "Início" dentro de um app
    expect(isColdEntry('navigate', 'https://outro.site/')).toBe(false);
  });
  it('isPhone exige toque e tela pequena', () => {
    const win = (coarse: boolean, w: number, h: number) => ({ matchMedia: ((q: string) => ({ matches: coarse && q.includes('coarse') })) as unknown as Window['matchMedia'], screen: { width: w, height: h } });
    expect(isPhone(win(true, 390, 844))).toBe(true);
    expect(isPhone(win(true, 844, 390))).toBe(true);
    expect(isPhone(win(true, 820, 1180))).toBe(false); // tablet
    expect(isPhone(win(false, 390, 844))).toBe(false); // janela pequena num computador
    expect(isPhone({})).toBe(false);
  });
});

describe('resolveOrigin · voltar à tela de origem', () => {
  const rec = (here: string | null, origin: string | null = null): NavRecord => ({ at: T0, here, origin });
  const base = { navType: 'navigate' as string | undefined, referrerPath: '/launcher/', record: null as NavRecord | null, sessionOrigin: null as string | null };
  it('abrir pelo Launcher guarda a tela em que a pessoa estava', () => {
    for (const where of ['/launcher/#/meus-apps', '/launcher/#/catalogo', '/launcher/#/app/viewer', '/launcher/#/']) {
      expect(resolveOrigin({ ...base, record: rec(where) })).toBe(where);
    }
    // Documentos e Ajustes não são origens: o link de voltar segue para o Início, como antes
    for (const where of ['/launcher/#/documentos', '/launcher/#/ajustes']) expect(resolveOrigin({ ...base, record: rec(where) })).toBeNull();
  });
  it('acesso direto não inventa origem, mesmo havendo uma antiga guardada', () => {
    expect(resolveOrigin({ ...base, referrerPath: '', record: rec('/apps/texto/', '/launcher/#/catalogo'), sessionOrigin: '/launcher/#/catalogo' })).toBeNull();
    expect(resolveOrigin({ ...base, referrerPath: '/outra-pagina/', record: rec(null, '/launcher/#/catalogo') })).toBeNull();
  });
  it('recarregar, voltar no histórico e passar de um app a outro mantêm a origem', () => {
    const kept = { record: rec('/apps/texto/', '/launcher/#/meus-apps') };
    expect(resolveOrigin({ ...base, ...kept, navType: 'reload', referrerPath: '' })).toBe('/launcher/#/meus-apps');
    expect(resolveOrigin({ ...base, ...kept, navType: 'back_forward', referrerPath: '' })).toBe('/launcher/#/meus-apps');
    expect(resolveOrigin({ ...base, ...kept, referrerPath: '/apps/visualizador/' })).toBe('/launcher/#/meus-apps');
    expect(resolveOrigin({ ...base, record: null, sessionOrigin: '/launcher/#/catalogo', referrerPath: '/apps/visualizador/' })).toBe('/launcher/#/catalogo');
  });
  it('retomada (vindo do Launcher com o app como "here") conserva a origem original', () => {
    expect(resolveOrigin({ ...base, record: rec('/apps/etiquetas/?doc=d1', '/launcher/#/meus-apps') })).toBe('/launcher/#/meus-apps');
  });
  it('a aba tem prioridade sobre o registro e um valor inválido é ignorado', () => {
    expect(resolveOrigin({ ...base, navType: 'reload', record: rec(null, '/launcher/#/catalogo'), sessionOrigin: '/launcher/#/meus-apps' })).toBe('/launcher/#/meus-apps');
    expect(resolveOrigin({ ...base, navType: 'reload', record: rec(null, '/launcher/#/catalogo'), sessionOrigin: 'https://evil.example/' })).toBe('/launcher/#/catalogo');
  });
});

describe('links de volta e rótulos', () => {
  const base = 'https://coding.test/apps/texto/';
  it('só links para o Início ou para os detalhes de um app são "voltar"', () => {
    expect(isBackToLauncher('/launcher/#/', base)).toBe(true);
    expect(isBackToLauncher('/launcher/#/app/viewer', base)).toBe(true);
    expect(isBackToLauncher('/launcher/#/documentos', base)).toBe(false); // "Voltar à biblioteca" é outro destino
    expect(isBackToLauncher('/launcher/', base)).toBe(false);
    expect(isBackToLauncher('https://outro.site/launcher/#/', base)).toBe(false);
    expect(isBackToLauncher('/apps/zip/', base)).toBe(false);
  });
  it('rótulos em português', () => {
    expect(originLabel('/launcher/#/')).toBe('Início');
    expect(originLabel('/launcher/#/meus-apps')).toBe('Meus apps');
    expect(originLabel('/launcher/#/catalogo')).toBe('Catálogo');
    expect(originLabel('/launcher/#/app/viewer')).toBe('Detalhes de Visualizador');
  });
});
