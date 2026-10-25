import { describe, expect, it } from 'vitest';
import { appKeyForType, canAdd, chooseTier, clearOverride, DEFAULT_SETTINGS, effectiveLimit, explainElevation, explainFull, isTier, LimitReached, minTierFor, normalizeLimitSettings, recommendTier, tierOptions, TIERS, useAutomatic } from './limits';

const disabled = (saved: number): number[] => tierOptions(saved).filter((o) => o.disabled).map((o) => o.tier);

describe('limites · faixas permitidas', () => {
  it('são exatamente 32, 64, 128, 256, 512 e 1024', () => {
    expect([...TIERS]).toEqual([32, 64, 128, 256, 512, 1024]);
    expect(isTier(64)).toBe(true);
    expect(isTier(100)).toBe(false);
    expect(isTier('64')).toBe(false);
  });
  it('200 salvos: 32, 64 e 128 desativadas, com motivo; 256 em diante liberadas (cenário F)', () => {
    expect(disabled(200)).toEqual([32, 64, 128]);
    const opts = tierOptions(200);
    expect(opts.find((o) => o.tier === 64)!.reason).toContain('200 projetos salvos');
    expect(opts.find((o) => o.tier === 256)!.disabled).toBe(false);
    expect(opts.find((o) => o.tier === 256)!.reason).toBe('');
    expect(minTierFor(200)).toBe(256);
  });
  it('exatamente 64: o 64 continua permitido; com 65 ele fecha; 70 → mínimo 128; 50 → mínimo 64 (cenário G)', () => {
    expect(disabled(64)).toEqual([32]);
    expect(disabled(65)).toEqual([32, 64]);
    expect(minTierFor(70)).toBe(128);
    expect(minTierFor(50)).toBe(64);
    expect(disabled(70)).toEqual([32, 64]);
    expect(disabled(50)).toEqual([32]);
    expect(disabled(0)).toEqual([]);
    expect(minTierFor(0)).toBe(32);
    expect(minTierFor(1024)).toBe(1024);
    expect(minTierFor(1025)).toBeNull();
  });
  it('o máximo (1024) nunca é desativado, mesmo com dados acima dele', () => {
    expect(disabled(5000)).toEqual([32, 64, 128, 256, 512]);
  });
});

describe('limites · efetivo', () => {
  it('automático sugere 64 e 200 salvos elevam para 256 sem apagar nada (cenário H)', () => {
    const e = effectiveLimit(DEFAULT_SETTINGS, 'calc', 200, 64);
    expect(e).toMatchObject({ limit: 256, requested: 64, source: 'auto', elevated: true, used: 200, free: 56, full: false });
    expect(explainElevation(e)).toContain('limite efetivo é 256');
    expect(explainElevation(effectiveLimit(DEFAULT_SETTINGS, 'calc', 10, 64))).toBe('');
  });
  it('cada app tem a sua contagem: outro app com poucos salvos não é afetado (cenário F)', () => {
    expect(effectiveLimit(DEFAULT_SETTINGS, 'calc', 200, 64).limit).toBe(256);
    expect(effectiveLimit(DEFAULT_SETTINGS, 'texts', 3, 64).limit).toBe(64);
  });
  it('no limite exato: cheio, não aceita mais um, e excluir libera a vaga (cenário I)', () => {
    const full = effectiveLimit(DEFAULT_SETTINGS, 'draw', 64, 64);
    expect(full.full).toBe(true);
    expect(canAdd(full)).toBe(false);
    expect(explainFull(full)).toContain('limite de 64');
    expect(explainFull(full)).toContain('aumente o limite em Ajustes');
    const freed = effectiveLimit(DEFAULT_SETTINGS, 'draw', 63, 64);
    expect(canAdd(freed)).toBe(true);
    expect(canAdd(freed, 2)).toBe(false); // importar 2 de uma vez não cabe
  });
  it('no máximo, a mensagem de cheio não sugere aumentar', () => {
    const e = effectiveLimit({ ...DEFAULT_SETTINGS, mode: 'manual', tier: 1024 }, 'calc', 1024, 64);
    expect(explainFull(e)).not.toContain('aumente');
  });
  it('manual global e valor próprio do app', () => {
    const manual = { ...DEFAULT_SETTINGS, mode: 'manual' as const, tier: 512 as const };
    expect(effectiveLimit(manual, 'calc', 10, 64)).toMatchObject({ limit: 512, source: 'manual' });
    const own = { ...manual, overrides: { calc: 128 as const } };
    expect(effectiveLimit(own, 'calc', 10, 64)).toMatchObject({ limit: 128, source: 'app' });
    expect(effectiveLimit(own, 'texts', 10, 64)).toMatchObject({ limit: 512, source: 'manual' });
    // manual menor que o salvo também sobe, sem apagar
    expect(effectiveLimit({ ...manual, tier: 32 }, 'calc', 40, 64)).toMatchObject({ limit: 64, elevated: true });
  });
});

describe('limites · escolha do usuário', () => {
  it('recusa valor abaixo da quantidade salva e aceita os demais', () => {
    const bad = chooseTier(DEFAULT_SETTINGS, 'calc', 64, 70);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('70 projetos salvos');
    const ok = chooseTier(DEFAULT_SETTINGS, 'calc', 128, 70);
    expect(ok.ok && ok.settings.overrides.calc).toBe(128);
    const same = chooseTier(DEFAULT_SETTINGS, 'calc', 64, 64);
    expect(same.ok).toBe(true);
    expect(chooseTier(DEFAULT_SETTINGS, 'calc', 100, 0).ok).toBe(false);
    const global = chooseTier(DEFAULT_SETTINGS, null, 256, 0);
    expect(global.ok && global.settings).toMatchObject({ mode: 'manual', tier: 256 });
  });
  it('limpar valor próprio e voltar ao automático', () => {
    const s = { ...DEFAULT_SETTINGS, mode: 'manual' as const, tier: 256 as const, overrides: { calc: 128 as const } };
    expect(clearOverride(s, 'calc').overrides).toEqual({});
    expect(useAutomatic(s).mode).toBe('auto');
  });
  it('normaliza configurações corrompidas', () => {
    for (const raw of [null, 5, 'x', [], { mode: 'x', tier: 99, overrides: 'a' }, { overrides: { 'MAIÚSCULO': 64, calc: 77, ok: 128 } }]) {
      const s = normalizeLimitSettings(raw);
      expect(s.mode).toBe('auto');
      expect(isTier(s.tier)).toBe(true);
    }
    expect(normalizeLimitSettings({ overrides: { 'MAIÚSCULO': 64, calc: 77, ok: 128 } }).overrides).toEqual({ ok: 128 });
    expect(normalizeLimitSettings(JSON.parse(JSON.stringify({ v: 1, mode: 'manual', tier: 512, overrides: { calc: 256 } })))).toEqual({ v: 1, mode: 'manual', tier: 512, overrides: { calc: 256 } });
  });
});

describe('limites · sugestão automática', () => {
  const GB = 1024 ** 3;
  it('sem sinais: 64', () => { expect(recommendTier({})).toBe(64); expect(recommendTier({ deviceMemory: null, cores: null, quotaBytes: null })).toBe(64); });
  it('pouco recurso: 32', () => {
    expect(recommendTier({ deviceMemory: 2 })).toBe(32);
    expect(recommendTier({ quotaBytes: 500 * 1024 * 1024 })).toBe(32);
    expect(recommendTier({ cores: 2, deviceMemory: 8 })).toBe(32);
  });
  it('vários sinais fortes: 128, mas não em aparelho de toque', () => {
    expect(recommendTier({ deviceMemory: 8, cores: 8 })).toBe(128);
    expect(recommendTier({ deviceMemory: 8, quotaBytes: 20 * GB })).toBe(128);
    expect(recommendTier({ deviceMemory: 8, cores: 8, coarsePointer: true })).toBe(64);
  });
  it('um sinal forte isolado não basta', () => { expect(recommendTier({ deviceMemory: 8 })).toBe(64); expect(recommendTier({ cores: 16 })).toBe(64); });
  it('nunca sugere fora de 32, 64 ou 128', () => {
    for (const m of [undefined, 0.5, 1, 2, 4, 8]) for (const c of [undefined, 1, 4, 8, 32]) for (const q of [undefined, 1e6, 2 * GB, 100 * GB]) {
      expect([32, 64, 128]).toContain(recommendTier({ deviceMemory: m, cores: c, quotaBytes: q }));
    }
  });
});

describe('limites · chaves e erro', () => {
  it('tipo antigo sheet pertence a Etiquetas', () => {
    expect(appKeyForType('sheet')).toBe('labels');
    expect(appKeyForType('calc')).toBe('calc');
    expect(appKeyForType(undefined)).toBe('outros');
  });
  it('mensagem do erro de limite', () => {
    const e = new LimitReached(64, 'em Planilhas');
    expect(e.limit).toBe(64);
    expect(e.message).toContain('Limite de 64 projetos salvos em Planilhas');
    expect(e.name).toBe('LimitReached');
  });
});
