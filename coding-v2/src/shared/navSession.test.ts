import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NAV_DONE_KEY, NAV_KEY, NAV_ORIGIN_KEY, parseRecord } from './navMemory';

vi.mock('./copyExists', () => ({ copyExists: vi.fn(async (id: string) => id === 'existe') }));
const { installAppNavMemory, resumeAtStartup, trackActivity } = await import('./navSession');

const rec = () => parseRecord(localStorage.getItem(NAV_KEY));
const seed = (value: object) => localStorage.setItem(NAV_KEY, JSON.stringify({ v: 1, ...value }));
const setReferrer = (value: string) => Object.defineProperty(document, 'referrer', { value, configurable: true });

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); history.replaceState(null, '', '/'); setReferrer(''); document.body.innerHTML = ''; });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('trackActivity · não grava a cada movimento', () => {
  it('uma gravação a cada 15 s, mais uma ao fechar a página', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    const stop = trackActivity(() => '/launcher/#/catalogo');
    expect(spy).toHaveBeenCalledTimes(1); // abrir a página conta como atividade
    for (let i = 0; i < 50; i++) window.dispatchEvent(new Event('pointerdown'));
    expect(spy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(15_000);
    expect(spy).toHaveBeenCalledTimes(2); // uma gravação com o resultado de tudo
    window.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(14_000);
    expect(spy).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event('pagehide'));
    expect(spy).toHaveBeenCalledTimes(3);
    stop();
    window.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(60_000);
    expect(spy).toHaveBeenCalledTimes(3); // depois de parar, nada mais
  });
  it('grava a última atividade (não o instante da gravação)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const stop = trackActivity(() => '/launcher/#/catalogo');
    vi.setSystemTime(1_800_000_000_000 + 5_000);
    window.dispatchEvent(new Event('keydown'));
    vi.setSystemTime(1_800_000_000_000 + 12 * 60_000);
    window.dispatchEvent(new Event('pagehide')); // fechou 12 min depois, sem ter tocado nada
    expect(rec()?.at).toBe(1_800_000_000_000 + 5_000);
    stop();
  });
  it('voltar à atividade depois de 20 min avisa que a sessão anterior venceu (e antes disso não)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const expired = vi.fn();
    const stop = trackActivity(() => '/launcher/#/catalogo', Date.now, expired);
    vi.setSystemTime(1_800_000_000_000 + 19 * 60_000);
    window.dispatchEvent(new Event('pointerdown'));
    expect(expired).not.toHaveBeenCalled(); // 19 min: ainda vale
    vi.setSystemTime(1_800_000_000_000 + 19 * 60_000 + 20 * 60_000);
    window.dispatchEvent(new Event('pointerdown'));
    expect(expired).toHaveBeenCalledTimes(1); // 20 min parado: venceu
    stop();
  });
  it('acompanha o endereço que o app troca sozinho (?doc=) sem esperar atividade', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    let here = '/apps/texto/';
    const stop = trackActivity(() => here);
    expect(rec()?.here).toBe('/apps/texto/');
    here = '/apps/texto/?doc=d1';
    vi.advanceTimersByTime(2_100);
    expect(rec()?.here).toBe('/apps/texto/?doc=d1');
    stop();
  });
});

describe('installAppNavMemory', () => {
  it('veio do Launcher: guarda a tela de origem e rotula o botão voltar', async () => {
    const now = Date.now();
    seed({ at: now, here: '/launcher/#/catalogo', origin: null });
    setReferrer(location.origin + '/launcher/');
    history.replaceState(null, '', '/apps/zip/');
    document.body.innerHTML = '<a id="b" href="/launcher/#/">Início</a><a id="x" href="/launcher/#/documentos">Biblioteca</a>';
    installAppNavMemory();
    expect(rec()).toMatchObject({ here: '/apps/zip/', origin: '/launcher/#/catalogo' });
    expect(sessionStorage.getItem(NAV_ORIGIN_KEY)).toBe('/launcher/#/catalogo');
    expect(document.getElementById('b')!.title).toBe('Voltar para Catálogo');
    expect(document.getElementById('b')!.getAttribute('aria-label')).toBe('Voltar para Catálogo');
    expect(document.getElementById('x')!.title).toBe(''); // só o link de voltar
    expect(document.getElementById('b')!.getAttribute('href')).toBe('/launcher/#/'); // o endereço original continua
  });
  it('acesso direto: limpa qualquer origem antiga e não rotula', () => {
    seed({ at: Date.now(), here: '/launcher/#/catalogo', origin: '/launcher/#/meus-apps' });
    sessionStorage.setItem(NAV_ORIGIN_KEY, '/launcher/#/meus-apps');
    history.replaceState(null, '', '/apps/zip/');
    document.body.innerHTML = '<a id="b" href="/launcher/#/">Início</a>';
    installAppNavMemory();
    expect(rec()?.origin).toBeNull();
    expect(sessionStorage.getItem(NAV_ORIGIN_KEY)).toBeNull();
    expect(document.getElementById('b')!.title).toBe('');
  });
  it('sessão vencida: a origem antiga é descartada', () => {
    seed({ at: Date.now() - 21 * 60_000, here: '/launcher/#/catalogo', origin: '/launcher/#/meus-apps' });
    setReferrer(location.origin + '/launcher/');
    history.replaceState(null, '', '/apps/zip/');
    installAppNavMemory();
    expect(rec()?.origin).toBeNull();
  });
  it('só guarda o id do documento no endereço', () => {
    history.replaceState(null, '', '/apps/texto/?doc=abc&x=<script>');
    installAppNavMemory();
    expect(rec()?.here).toBe('/apps/texto/?doc=abc');
  });
});

describe('resumeAtStartup', () => {
  it('qualquer dispositivo, entrada fria e sessão antiga: volta para a tela guardada', async () => {
    seed({ at: Date.now() - 90 * 24 * 60_000, here: '/launcher/#/catalogo', origin: null });
    expect(await resumeAtStartup()).toBe(false); // continua montando o Launcher, já na rota certa
    expect(location.hash).toBe('#/catalogo');
    expect(sessionStorage.getItem(NAV_DONE_KEY)).toBe('1');
  });
  it('avalia uma vez por aba: não repete (sem laço)', async () => {
    sessionStorage.setItem(NAV_DONE_KEY, '1');
    seed({ at: Date.now(), here: '/launcher/#/catalogo', origin: null });
    await resumeAtStartup();
    expect(location.hash).toBe('');
  });
  it('computador retoma depois de meses, mas o link explícito prevalece', async () => {
    seed({ at: Date.now() - 90 * 24 * 60_000, here: '/launcher/#/catalogo', origin: null });
    await resumeAtStartup();
    expect(location.hash).toBe('#/catalogo');

    sessionStorage.clear();
    history.replaceState(null, '', '/launcher/#/ajustes');
    await resumeAtStartup();
    expect(location.hash).toBe('#/ajustes');
  });
  it('não retoma vindo de um aplicativo (clique em "Início") nem recarregando', async () => {
    seed({ at: Date.now(), here: '/launcher/#/catalogo', origin: null });
    setReferrer(location.origin + '/apps/zip/');
    await resumeAtStartup();
    expect(location.hash).toBe('');
  });
  it('registro adulterado não leva a lugar nenhum', async () => {
    seed({ at: Date.now(), here: 'https://evil.example/', origin: null });
    expect(await resumeAtStartup()).toBe(false);
    expect(location.pathname + location.hash).toBe('/');
  });
});
