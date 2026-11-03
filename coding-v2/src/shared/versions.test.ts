import { describe, expect, it } from 'vitest';
import { tools } from './catalog';
import {
  allSlugs, buildStamp, compareSemver, formatBuildDateTime, formatDateTime, historyPath, isSemver, latestOf, newestFirst, pageOf, parseBuild,
  recordsFor, sectionsOf, slugOf, TARGET_ORDER, targetFromSlug, targetName, validateRecords, type VersionRecord
} from './versions';
import { versionRecords } from './versions-data';

const rec = (over: Partial<VersionRecord> = {}): VersionRecord => ({
  target: 'launcher', version: '2.0.0', build: '25.10.26.225430', releaseDate: '2026-10-25', releaseTime: '22:54:30', novidades: ['x'], ...over
});

describe('compilação DD.MM.AA.HHMMSS', () => {
  it('usa o fuso de São Paulo e zeros à esquerda', () => {
    expect(buildStamp(new Date('2026-10-26T01:54:30Z'))).toBe('25.10.26.225430');
    expect(buildStamp(new Date('2027-01-05T12:03:09Z'))).toBe('05.01.27.090309');
    // virada do dia: 02:30 UTC ainda é o dia anterior em São Paulo
    expect(buildStamp(new Date('2026-03-01T02:30:00Z'))).toBe('28.02.26.233000');
  });
  it('decodifica data e hora e recusa calendário inválido', () => {
    expect(parseBuild('25.10.26.225430')).toEqual({ date: '2026-10-25', time: '22:54:30' });
    expect(parseBuild('29.02.28.000000')).toEqual({ date: '2028-02-29', time: '00:00:00' });
    for (const bad of ['29.02.27.000000', '32.01.26.000000', '01.13.26.000000', '01.01.26.240000', '01.01.26.006000', '1.1.26.000000', '01.01.2026.000000', '01.01.26.00000', '', 'x']) expect(parseBuild(bad), bad).toBeNull();
  });
  it('formata data e hora em português', () => {
    expect(formatDateTime('2026-10-25', '22:54:30')).toBe('25/10/2026 às 22:54:30');
    expect(formatBuildDateTime('25.10.26.225430')).toBe('25/10/2026 às 22:54:30');
  });
  it('a data de lançamento é independente da data da compilação', () => {
    const r = rec({ build: '25.10.26.225430', releaseDate: '2026-10-27', releaseTime: '09:00:00' });
    expect(validateRecords([r])).toEqual([]);
    expect(parseBuild(r.build)?.date).not.toBe(r.releaseDate);
    expect(validateRecords([rec({ releaseDate: '2026-10-24' })])).toEqual(['launcher 2.0.0: lançamento anterior à compilação']);
  });
});

describe('versão semver', () => {
  it('aceita só MAJOR.MINOR.PATCH', () => {
    for (const ok of ['0.0.1', '1.0.0', '2.10.3']) expect(isSemver(ok)).toBe(true);
    for (const bad of ['1.0', '01.0.0', '1.0.0-beta', 'v1.0.0', '1.0.0.0', '']) expect(isSemver(bad), bad).toBe(false);
    expect(compareSemver('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareSemver('2.0.0', '2.0.0')).toBe(0);
  });
});

describe('alvos e endereços', () => {
  it('há exatamente o Launcher e os 16 apps do catálogo, cada um uma vez', () => {
    expect(TARGET_ORDER).toHaveLength(17);
    expect(new Set(TARGET_ORDER).size).toBe(17);
    expect(TARGET_ORDER.slice(1).sort()).toEqual(tools.map((t) => t.id).sort());
  });
  it('o endereço de cada histórico vem da pasta real da página do app', () => {
    expect(historyPath('launcher')).toBe('/versoes/');
    for (const t of tools) {
      expect(historyPath(t.id)).toBe('/versoes/' + t.path?.split('/')[2] + '/');
      expect(targetFromSlug(slugOf(t.id))).toBe(t.id);
      expect(targetName(t.id)).toBe(t.name);
    }
    expect(new Set(allSlugs()).size).toBe(17);
    expect(targetFromSlug('nao-existe')).toBeNull();
    expect(targetName('launcher')).toBe('Coding Launcher');
  });
  it('o menu segue a ordem aprovada', () => {
    expect(TARGET_ORDER.map(targetName)).toEqual(['Coding Launcher', 'Etiquetas', 'Texto', 'Planilhas', 'Imagens', 'Editor PDF', 'QR / Barras', 'Sorteio', 'Racha-conta', 'Calculadora', 'Estúdio de Cores', 'Compactador ZIP', 'Comparador de Arquivos', 'Código', 'Pintar', 'Visualizador', 'Versos']);
  });
});

describe('registro e ordenação', () => {
  it('o registro real é válido e todo alvo tem ao menos uma versão', () => {
    expect(validateRecords(versionRecords)).toEqual([]);
    for (const t of TARGET_ORDER) expect(latestOf(t, versionRecords), t).not.toBeNull();
  });
  it('detecta registros inválidos', () => {
    const errors = validateRecords([rec({ version: '2.0' }), rec({ version: '1.0.0', build: '99.99.99.999999' }), rec({ version: '1.1.0', novidades: [] }), rec({ version: '1.2.0', releaseDate: '2026-02-30' }), rec({ version: '1.3.0', prUrl: 'http://x' }), rec(), rec()]);
    expect(errors.join('\n')).toMatch(/fora do formato/);
    expect(errors.join('\n')).toMatch(/compilação inválida/);
    expect(errors.join('\n')).toMatch(/sem nenhuma nota/);
    expect(errors.join('\n')).toMatch(/data de lançamento inválida/);
    expect(errors.join('\n')).toMatch(/prUrl/);
    expect(errors.join('\n')).toMatch(/versão repetida/);
  });
  it('ordena do mais recente para o mais antigo e filtra por alvo', () => {
    const a = rec({ version: '1.0.0', build: '01.01.26.000000', releaseDate: '2026-01-01', releaseTime: '00:00:00' });
    const b = rec({ version: '1.1.0', build: '02.01.26.000000', releaseDate: '2026-01-02', releaseTime: '10:00:00' });
    const c = rec({ version: '1.1.1', build: '02.01.26.000000', releaseDate: '2026-01-02', releaseTime: '11:00:00' });
    const other = rec({ target: 'zip', version: '9.9.9' });
    expect(recordsFor('launcher', [a, other, c, b]).map((r) => r.version)).toEqual(['1.1.1', '1.1.0', '1.0.0']);
    expect(latestOf('launcher', [a, b, c])?.version).toBe('1.1.1');
    expect(latestOf('paint', [a, b, c])).toBeNull();
    expect([a, c, b].sort(newestFirst).map((r) => r.version)).toEqual(['1.1.1', '1.1.0', '1.0.0']);
  });
  it('só mostra seções com conteúdo', () => {
    expect(sectionsOf(rec({ novidades: ['n'], correcoes: ['c'], melhorias: [] })).map((s) => s.title)).toEqual(['Novidades', 'Correções']);
    expect(sectionsOf(rec({ novidades: undefined, problemasConhecidos: ['p'], alteracoesTecnicas: ['t'] })).map((s) => s.title)).toEqual(['Alterações técnicas', 'Problemas conhecidos']);
  });
  it('lista grande: paginação sem copiar tudo', () => {
    const big = Array.from({ length: 1200 }, (_, i) => rec({ version: '1.0.' + i, build: '01.10.26.000000', releaseTime: '10:00:00' }));
    expect(validateRecords(big)).toEqual([]);
    const sorted = recordsFor('launcher', big);
    expect(sorted).toHaveLength(1200);
    const page = pageOf(sorted, 50);
    expect(page.items).toHaveLength(50);
    expect(page.remaining).toBe(1150);
    expect(pageOf(sorted, 5000).remaining).toBe(0);
    expect(pageOf([], 50)).toEqual({ items: [], remaining: 0 });
  });
});
