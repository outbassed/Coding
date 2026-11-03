import { describe, expect, it } from 'vitest';
import { closeMany, closeTab, emptyTabs, hasTab, lruVisible, moveTab, normalizeTabs, openTab, overflowCount, overflowTabs, OPEN_MAX, pruneMissing, renameTab, searchOverflow, selectTab, VISIBLE_MAX, visibleTabs, type TabsState } from './tabs';

const ids = (list: { id: string }[]): string[] => list.map((t) => t.id);
/** Monta um estado com n projetos abertos, P1 a Pn, cada um acessado no instante i (P1 o mais antigo). */
function projects(n: number, active = n): TabsState {
  return { v: 1, open: Array.from({ length: n }, (_, i) => ({ id: 'P' + (i + 1), title: 'Projeto ' + (i + 1), accessedAt: (i + 1) * 100 })), active: 'P' + active };
}

describe('abas · visíveis e +N', () => {
  it('3 abertas: 3 visíveis e nenhum contador', () => {
    const s = projects(3);
    expect(visibleTabs(s)).toHaveLength(3);
    expect(overflowCount(s)).toBe(0);
    expect(overflowTabs(s)).toEqual([]);
  });
  it('contador = abertas − 5 (6 → +1, 7 → +2, 64 → +59, 1024 → +1019)', () => {
    expect(overflowCount(projects(5))).toBe(0);
    expect(overflowCount(projects(6))).toBe(1);
    expect(overflowCount(projects(7))).toBe(2);
    expect(overflowCount(projects(64))).toBe(59);
    expect(overflowCount(projects(1024))).toBe(1019);
    expect(visibleTabs(projects(1024))).toHaveLength(VISIBLE_MAX);
  });
});

describe('abas · troca pela menos recentemente ACESSADA (cenários A e B)', () => {
  it('A: P1–P7 abertas; P5 é a menos acessada; escolher P7 deixa P1,P2,P3,P4,P7 visíveis, P5 no +2, nada fechado', () => {
    let s = projects(7, 7);
    // acessa P1..P4 depois, então P5 passa a ser a menos recentemente acessada entre as visíveis
    s = selectTab(s, 'P1', 1000); s = selectTab(s, 'P2', 1100); s = selectTab(s, 'P3', 1200); s = selectTab(s, 'P4', 1300);
    expect(lruVisible(s)!.id).toBe('P5');
    s = selectTab(s, 'P7', 1400);
    expect(ids(visibleTabs(s))).toEqual(['P1', 'P2', 'P3', 'P4', 'P7']);
    expect(ids(overflowTabs(s)).sort()).toEqual(['P5', 'P6']);
    expect(overflowCount(s)).toBe(2);
    expect(s.open).toHaveLength(7);
    expect(s.active).toBe('P7');
  });
  it('B: só ler (selecionar) atualiza o acesso; editar uma aba não selecionada não muda a regra', () => {
    let s = projects(7, 7);
    // P1 é a mais antiga; abrir/ler P1 a torna recente, então a menos acessada passa a ser P2
    s = selectTab(s, 'P1', 5000);
    expect(s.open.find((t) => t.id === 'P1')!.accessedAt).toBe(5000);
    expect(lruVisible(s)!.id).toBe('P2');
    // renomear (como se fosse uma edição) não mexe no acesso
    const edited = renameTab(s, 'P2', 'Editado agora');
    expect(edited.open.find((t) => t.id === 'P2')!.accessedAt).toBe(200);
    expect(lruVisible(edited)!.id).toBe('P2');
    // então escolher P6 desloca P2, não "o mais recentemente editado"
    const after = selectTab(edited, 'P6', 6000);
    expect(ids(overflowTabs(after))).toContain('P2');
    expect(ids(visibleTabs(after))).toContain('P6');
  });
  it('a aba ativa nunca é a escolhida para sair (mesmo com acessos empatados)', () => {
    let s: TabsState = { v: 1, open: Array.from({ length: 7 }, (_, i) => ({ id: 'P' + (i + 1), title: 'x', accessedAt: 0 })), active: 'P1' };
    s = selectTab(s, 'P7', 10);
    expect(ids(overflowTabs(s))).not.toContain('P7');
    expect(ids(visibleTabs(s))).toContain('P7');
  });
  it('selecionar uma aba visível só atualiza acesso e ativa, sem reordenar', () => {
    const s = selectTab(projects(7), 'P2', 9999);
    expect(ids(s.open)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7']);
    expect(s.active).toBe('P2');
  });
  it('id inexistente não muda nada', () => { const s = projects(3); expect(selectTab(s, 'X', 1)).toBe(s); });
});

describe('abas · abrir, fechar, renomear, reordenar', () => {
  it('abrir novo com vaga entra no fim e fica ativo; repetido só seleciona', () => {
    let s = openTab(emptyTabs(), { id: 'a', title: 'A' }, 1);
    s = openTab(s, { id: 'b', title: 'B' }, 2);
    expect(ids(s.open)).toEqual(['a', 'b']);
    expect(s.active).toBe('b');
    const again = openTab(s, { id: 'a', title: 'A renomeado' }, 3);
    expect(again.open).toHaveLength(2);
    expect(again.active).toBe('a');
    expect(again.open[0]!.title).toBe('A renomeado');
  });
  it('abrir uma sexta aba a deixa visível e manda a menos acessada para o +1', () => {
    let s = projects(5, 5);
    s = openTab(s, { id: 'P6', title: 'Seis' }, 9000);
    expect(ids(visibleTabs(s))).toContain('P6');
    expect(ids(overflowTabs(s))).toEqual(['P1']);
    expect(overflowCount(s)).toBe(1);
  });
  it('D: fechar tira da lista sem perder as outras; reabrir depois funciona', () => {
    let s = projects(7, 7);
    s = closeTab(s, 'P3');
    expect(hasTab(s, 'P3')).toBe(false);
    expect(s.open).toHaveLength(6);
    expect(overflowCount(s)).toBe(1);
    s = openTab(s, { id: 'P3', title: 'Projeto 3' }, 9000);
    expect(hasTab(s, 'P3')).toBe(true);
  });
  it('fechar uma visível com abas escondidas traz a escondida mais recente', () => {
    let s = projects(8, 1);
    s = selectTab(s, 'P1', 5000);
    s = { ...s, open: s.open.map((t) => (t.id === 'P7' ? { ...t, accessedAt: 4000 } : t)) };
    s = closeTab(s, 'P2');
    expect(ids(visibleTabs(s))).toHaveLength(5);
    expect(ids(visibleTabs(s))).toContain('P7');
    expect(overflowCount(s)).toBe(2);
  });
  it('fechar a ativa passa a ativa para a mais recentemente acessada; fechar tudo deixa nula', () => {
    let s = projects(3, 3);
    s = closeTab(s, 'P3');
    expect(s.active).toBe('P2');
    s = closeMany(s, ['P1', 'P2']);
    expect(s.active).toBeNull();
    expect(s.open).toEqual([]);
  });
  it('fechar várias de uma vez', () => {
    let s = projects(10, 10);
    s = closeMany(s, ['P1', 'P2', 'P3']);
    expect(s.open).toHaveLength(7);
    expect(visibleTabs(s)).toHaveLength(5);
    expect(closeMany(s, ['nao-existe'])).toBe(s);
  });
  it('renomear limpa o título; reordenar só entre as visíveis', () => {
    let s = renameTab(projects(3), 'P1', '  Novo\nnome  ');
    expect(s.open[0]!.title).toBe('Novo nome');
    expect(renameTab(s, 'P1', '   ').open[0]!.title).toBe('Sem título');
    s = moveTab(s, 'P1', 1);
    expect(ids(s.open)).toEqual(['P2', 'P1', 'P3']);
    expect(moveTab(s, 'P2', -1)).toBe(s);
    expect(moveTab(s, 'P3', 1)).toBe(s);
    const big = projects(7);
    expect(moveTab(big, 'P5', 1)).toBe(big); // P6 está no +N: não se reordena para fora das visíveis
    expect(moveTab(big, 'P6', -1)).toBe(big);
  });
  it('busca no +N sem acento e sem diferenciar maiúsculas; só vê as escondidas', () => {
    let s = projects(8);
    s = renameTab(s, 'P7', 'Relatório Anual'); s = renameTab(s, 'P8', 'Orçamento');
    expect(ids(searchOverflow(s, 'relatorio'))).toEqual(['P7']);
    expect(ids(searchOverflow(s, 'ORÇAMENTO'))).toEqual(['P8']);
    expect(searchOverflow(s, 'Projeto 1')).toEqual([]); // P1 está visível, não no +N
    expect(searchOverflow(s, '')).toHaveLength(3);
  });
});

describe('abas · restauração e dados ruins (cenários C e K)', () => {
  it('C: o que é gravado volta igual (ordem, acessos, ativa)', () => {
    let s = projects(7, 7);
    s = selectTab(s, 'P3', 5000);
    const back = normalizeTabs(JSON.parse(JSON.stringify(s)));
    expect(back).toEqual(s);
    expect(back.active).toBe('P3');
  });
  it('documento que sumiu sai das abas; o resto fica', () => {
    const { state, dropped } = pruneMissing(projects(7, 6), new Set(['P1', 'P2', 'P3', 'P4', 'P5', 'P7']));
    expect(ids(dropped)).toEqual(['P6']);
    expect(state.open).toHaveLength(6);
    expect(state.active).not.toBe('P6');
    const same = projects(3);
    expect(pruneMissing(same, new Set(['P1', 'P2', 'P3'])).state).toBe(same);
  });
  it('normaliza lixo sem lançar, sem repetir ids e com ativa válida', () => {
    for (const raw of [null, undefined, 3, 'x', [], {}, { open: 'a' }, { open: [null, 4, { id: 5 }, { id: '' }] }]) {
      const s = normalizeTabs(raw);
      expect(s.open).toEqual([]);
      expect(s.active).toBeNull();
    }
    const s = normalizeTabs({ open: [{ id: 'a', title: 'A', accessedAt: 5 }, { id: 'a', title: 'repetido' }, { id: 'b', accessedAt: 'x' }], active: 'zzz' });
    expect(ids(s.open)).toEqual(['a', 'b']);
    expect(s.open[1]).toMatchObject({ title: 'Sem título', accessedAt: 0 });
    expect(s.active).toBe('a');
  });
  it('J: 1024 abas viram só metadados; seleção no +N continua exata e limitada', () => {
    let s = projects(OPEN_MAX, 1);
    expect(overflowCount(s)).toBe(1019);
    s = selectTab(s, 'P900', 10_000_000);
    expect(visibleTabs(s)).toHaveLength(5);
    expect(ids(visibleTabs(s))).toContain('P900');
    expect(s.open).toHaveLength(1024);
    expect(overflowCount(s)).toBe(1019);
    // não passa de 1024 abertas
    expect(openTab(s, { id: 'novo', title: 'x' }, 1).open).toHaveLength(1024);
    // normalizar um arquivo com mais que o máximo corta no limite
    const big = { open: Array.from({ length: 2000 }, (_, i) => ({ id: 'x' + i, title: 't', accessedAt: i })) };
    expect(normalizeTabs(big).open).toHaveLength(1024);
  });
});
