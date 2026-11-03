import { describe, expect, it } from 'vitest';
import { locate } from './route';
import { allSlugs, historyPath, TARGET_ORDER } from '../shared/versions';

describe('rotas da Central de Versões', () => {
  it('a raiz e o alias abrem o histórico do Launcher', () => {
    for (const p of ['/versoes/', '/versoes', '/versions/', '/versions', '/versoes/launcher/']) expect(locate(p), p).toMatchObject({ kind: 'target', target: 'launcher', canonical: p === '/versoes/' });
  });
  it('cada app tem um endereço próprio, com e sem a barra final e pelo alias', () => {
    for (const t of TARGET_ORDER.slice(1)) {
      const path = historyPath(t);
      expect(locate(path)).toEqual({ kind: 'target', target: t, canonical: true });
      expect(locate(path.slice(0, -1))).toEqual({ kind: 'target', target: t, canonical: false });
      expect(locate(path.replace('/versoes/', '/versions/'))).toEqual({ kind: 'target', target: t, canonical: false });
    }
  });
  it('slug desconhecido ou caminho longo demais não vira outro app', () => {
    expect(locate('/versoes/nao-existe/')).toEqual({ kind: 'unknown', slug: 'nao-existe' });
    expect(locate('/versoes/etiquetas/extra/')).toMatchObject({ kind: 'unknown' });
    expect(allSlugs()).toContain('etiquetas');
  });
  it('ignora maiúsculas no slug', () => {
    expect(locate('/versoes/ETIQUETAS/')).toMatchObject({ kind: 'target', target: 'labels' });
  });
});
