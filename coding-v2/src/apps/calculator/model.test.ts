import { describe, expect, it } from 'vitest';
import { backspace, clearAll, clearEntry, defineVariable, emptyCalc, equals, historyText, insertText, memory, normalizeCalc, preview, removeVariable, toggleSign, type CalcState } from './model';
import { calculatorKind, calculatorTemplates } from './kind';

/** Simula teclas do teclado numérico. */
function keys(seq: string[], from: CalcState = emptyCalc('basic')): CalcState {
  let s = from;
  for (const k of seq) {
    if (k === '=') s = equals(s, 1).state;
    else if (k === '±') s = toggleSign(s);
    else if (k === '⌫') s = backspace(s);
    else if (k === 'C') s = clearEntry(s);
    else s = insertText(s, k).state;
  }
  return s;
}
const type = (text: string, from?: CalcState) => keys([...text], from);

describe('calculadora · teclado', () => {
  it('conta simples e histórico', () => {
    const s = type('12+30=');
    expect(s.ans).toBe(42);
    expect(s.done).toBe(true);
    expect(s.history).toHaveLength(1);
    expect(s.history[0]).toMatchObject({ expr: '12+30', value: 42, text: '42' });
  });
  it('continua do resultado ao digitar um operador, e recomeça ao digitar um número', () => {
    const s = type('6*7=');
    expect(type('+8', s).expr).toBe('42+8');
    expect(type('5', s).expr).toBe('5');
    expect(equals(type('+8', s)).state.ans).toBe(50);
  });
  it('troca de operador em vez de empilhar', () => {
    expect(type('5+*3').expr).toBe('5×3');
    expect(type('5+-3').expr).toBe('5−3');
    expect(type('5*-3').expr).toBe('5×−3');
    expect(equals(type('5*-3')).state.ans).toBe(-15);
  });
  it('operador no começo é ignorado, a não ser o menos; depois de um resultado usa ans', () => {
    expect(type('*').expr).toBe('');
    expect(type('-5').expr).toBe('−5');
    expect(type('(*').expr).toBe('(');
  });
  it('vírgula decimal só uma vez por número e com zero à esquerda', () => {
    expect(type(',').expr).toBe('0,');
    expect(type('1,5,2').expr).toBe('1,52');
    expect(type('1,5+2,5').expr).toBe('1,5+2,5');
    expect(type('3.5').expr).toBe('3,5');
    expect(equals(type('1,5+2,5')).state.ans).toBe(4);
  });
  it('porcentagem sobre o valor da esquerda', () => {
    expect(equals(type('200+10%')).state.ans).toBe(220);
    expect(equals(type('200-15%')).state.ans).toBe(170);
  });
  it('± troca o sinal do último número', () => {
    expect(keys(['5', '±']).expr).toBe('−5');
    expect(keys(['5', '±', '±']).expr).toBe('5');
    expect(keys(['5', '+', '3', '±']).expr).toBe('5−3');
    expect(keys(['5', '−', '3', '±']).expr).toBe('5+3');
    expect(keys(['5', '×', '3', '±']).expr).toBe('5×−3');
    expect(toggleSign(type('2+3=')).expr).toBe('−5');
  });
  it('⌫ apaga um caractere, ou a função inteira', () => {
    expect(keys(['1', '2', '⌫']).expr).toBe('1');
    expect(backspace({ ...emptyCalc('pro'), expr: '2+sin(' }).expr).toBe('2+');
    expect(backspace({ ...emptyCalc('pro'), expr: '' }).expr).toBe('');
  });
  it('C limpa a entrada; limpar tudo também zera ans', () => {
    const s = type('2+2=');
    expect(clearEntry(s).expr).toBe('');
    expect(clearEntry(s).ans).toBe(4);
    expect(clearAll(s).ans).toBeNull();
    expect(clearEntry(s).history).toHaveLength(1);
  });
  it('erro não altera o estado nem o histórico', () => {
    const s = type('5/0');
    const r = equals(s);
    expect(r.outcome.ok).toBe(false);
    expect(r.state).toBe(s);
    expect(r.state.history).toHaveLength(0);
  });
  it('tamanho máximo da expressão', () => {
    const s = type('1'.repeat(600));
    expect(s.expr.length).toBe(500);
  });
  it('inserção no meio da expressão (Pro)', () => {
    const s: CalcState = { ...emptyCalc('pro'), expr: '2+3' };
    const edit = insertText(s, '5', 1, 1);
    expect(edit.state.expr).toBe('25+3');
    expect(edit.caret).toBe(2);
    expect(insertText(s, 'sin(', 2, 3).state.expr).toBe('2+sin(');
  });
});

describe('calculadora · cálculo ao vivo e casas decimais', () => {
  it('mostra o resultado enquanto digita, fechando parênteses', () => {
    const p = preview({ ...emptyCalc('pro'), expr: '2*(3+4' });
    expect(p).toEqual({ ok: true, value: 14 });
    expect(preview(emptyCalc())).toBeNull();
  });
  it('graus e radianos', () => {
    expect(preview({ ...emptyCalc('pro'), expr: 'sin(90)' })).toEqual({ ok: true, value: 1 });
    expect(preview({ ...emptyCalc('pro'), angle: 'rad', expr: 'sin(pi/2)' })).toEqual({ ok: true, value: 1 });
  });
  it('o texto do histórico respeita as casas decimais', () => {
    const s = equals({ ...emptyCalc(), decimals: 2, expr: '10/4' }).state;
    expect(s.history[0]?.text).toBe('2,50');
  });
});

describe('calculadora · memória', () => {
  it('M+, M−, MR e MC', () => {
    let s = type('5+5');
    let m = memory(s, 'm+');
    expect(m.state.memory).toBe(10);
    s = type('4', clearEntry(m.state));
    m = memory(s, 'm-');
    expect(m.state.memory).toBe(6);
    const recalled = memory(clearEntry(m.state), 'mr');
    expect(recalled.state.expr).toBe('6');
    expect(memory(m.state, 'mc').state.memory).toBe(0);
  });
  it('não mexe na memória com expressão inválida', () => {
    const m = memory(type('5/0'), 'm+');
    expect(m.state.memory).toBe(0);
    expect(m.message).toContain('valor válido');
  });
  it('usa o último resultado depois de "="', () => {
    expect(memory(type('3*3='), 'm+').state.memory).toBe(9);
  });
});

describe('calculadora · variáveis', () => {
  it('cria, usa, atualiza e remove', () => {
    let s = emptyCalc('pro');
    const a = defineVariable(s, 'Taxa', '1/100');
    expect(a.ok && a.state.vars).toEqual([{ name: 'taxa', value: 0.01 }]);
    if (a.ok) s = a.state;
    expect(preview({ ...s, expr: '100*(1+taxa)' })).toEqual({ ok: true, value: 101 });
    const b = defineVariable(s, 'taxa', '0,02');
    expect(b.ok && b.state.vars).toEqual([{ name: 'taxa', value: 0.02 }]);
    expect(removeVariable(s, 'taxa').vars).toEqual([]);
  });
  it('recusa nomes inválidos, reservados e valores com erro', () => {
    const s = emptyCalc('pro');
    for (const name of ['1a', 'a b', '', 'sin', 'pi', 'ans', 'x'.repeat(17), 'a-b']) expect(defineVariable(s, name, '1').ok, name).toBe(false);
    expect(defineVariable(s, 'ok', '1/0').ok).toBe(false);
    expect(defineVariable(s, 'ok', 'alert(1)').ok).toBe(false);
  });
});

describe('calculadora · documento', () => {
  it('normaliza dados corrompidos sem lançar', () => {
    for (const raw of [null, undefined, 5, 'x', [], {}, { mode: 'x', vars: 'a', history: 4 }, { expr: 5, ans: 'a', memory: NaN, decimals: 99 }]) {
      const s = normalizeCalc(raw);
      expect(s.mode === 'basic' || s.mode === 'pro').toBe(true);
      expect(Number.isFinite(s.memory)).toBe(true);
      expect(typeof s.expr).toBe('string');
    }
    expect(normalizeCalc({ decimals: 99 }).decimals).toBe(10);
    expect(normalizeCalc({ decimals: -3 }).decimals).toBe(0);
  });
  it('filtra variáveis e histórico inválidos e limita o tamanho', () => {
    const s = normalizeCalc({
      vars: [{ name: 'ok', value: 1 }, { name: 'OK', value: 2 }, { name: 'sin', value: 3 }, { name: 'a b', value: 1 }, { name: 'z', value: Infinity }, null],
      history: [{ expr: '1+1', value: 2, text: '2', at: 1 }, { expr: 5, value: 2 }, { expr: 'x', value: 'y' }]
    });
    expect(s.vars).toEqual([{ name: 'ok', value: 1 }]);
    expect(s.history).toHaveLength(1);
    const many = normalizeCalc({ history: Array.from({ length: 300 }, (_, i) => ({ expr: '1', value: i, text: String(i), at: i })) });
    expect(many.history).toHaveLength(100);
    expect(many.history.at(-1)?.value).toBe(299);
  });
  it('vai e volta pelo JSON sem perder nada', () => {
    const s = equals({ ...emptyCalc('pro'), decimals: 3, expr: '2^10', vars: [{ name: 'k', value: 7 }], memory: 4 }, 5).state;
    expect(normalizeCalc(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it('os modelos são estados válidos e o tipo é o do app', () => {
    expect(calculatorKind.type).toBe('calculator');
    expect(calculatorKind.prefix).toBe('v2-calculator-');
    for (const t of calculatorTemplates) {
      const s = t.create();
      expect(normalizeCalc(s)).toEqual(s);
      expect(calculatorKind.label(s).length).toBeGreaterThan(0);
    }
    const juros = calculatorTemplates.find((t) => t.id === 'juros')!.create();
    const p = preview(juros);
    expect(p && p.ok && Math.round(p.value * 100) / 100).toBe(1126.83);
    const desconto = calculatorTemplates.find((t) => t.id === 'desconto')!.create();
    expect(equals(desconto).state.ans).toBe(170);
  });
  it('texto do histórico', () => {
    const s = type('2+2=');
    expect(historyText(s)).toContain('2+2 = 4');
  });
});
