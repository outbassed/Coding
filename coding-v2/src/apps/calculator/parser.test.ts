import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CalcError, calculate, closeParentheses, tryCalculate } from './parser';

const calc = (s: string, o = {}) => calculate(s, o);
const error = (s: string, o = {}): string => { const r = tryCalculate(s, o); return r.ok ? 'sem erro: ' + r.value : r.error; };

describe('calculadora · operações básicas', () => {
  it('quatro operações e precedência', () => {
    expect(calc('2+3*4')).toBe(14);
    expect(calc('(2+3)*4')).toBe(20);
    expect(calc('10/4')).toBe(2.5);
    expect(calc('2^3^2')).toBe(512); // potência é associativa à direita
    expect(calc('-2^2')).toBe(-4);
    expect(calc('2^-2')).toBe(0.25);
    expect(calc('--3')).toBe(3);
  });
  it('aceita os símbolos × ÷ − e vírgula decimal', () => {
    expect(calc('6×7')).toBe(42);
    expect(calc('9÷2')).toBe(4.5);
    expect(calc('10−4')).toBe(6);
    expect(calc('1,5+1,5')).toBe(3);
    expect(calc('1.5+1.5')).toBe(3);
  });
  it('não mostra ruído de ponto flutuante', () => {
    expect(calc('0,1+0,2')).toBe(0.3);
    expect(calc('0,1+0,2-0,3')).toBe(0);
    expect(calc('1,1*3')).toBe(3.3);
    expect(Object.is(calc('0*-1'), 0)).toBe(true);
  });
  it('percentual: de si mesmo, e do valor à esquerda em soma e subtração', () => {
    expect(calc('50%')).toBe(0.5);
    expect(calc('200+10%')).toBe(220);
    expect(calc('200-10%')).toBe(180);
    expect(calc('200*10%')).toBe(20);
    expect(calc('80+25%+10')).toBe(110);
  });
  it('multiplicação implícita entre número e parêntese, constante ou função', () => {
    expect(calc('2(3+4)')).toBe(14);
    expect(calc('2pi')).toBeCloseTo(6.283185307, 8);
    expect(calc('(1+1)(2+2)')).toBe(8);
    expect(calc('3sin(90)')).toBe(3);
  });
  it('fatorial', () => {
    expect(calc('5!')).toBe(120);
    expect(calc('0!')).toBe(1);
    expect(calc('3!!')).toBe(720);
    expect(error('2,5!')).toContain('fatorial');
    expect(error('171!')).toContain('fatorial');
    expect(error('(-1)!')).toContain('fatorial');
  });
});

describe('calculadora · funções científicas', () => {
  it('trigonometria em graus e em radianos', () => {
    expect(calc('sin(30)', { angle: 'deg' })).toBeCloseTo(0.5, 12);
    expect(calc('sin(180)', { angle: 'deg' })).toBe(0);
    expect(calc('cos(90)', { angle: 'deg' })).toBe(0);
    expect(calc('sin(pi/2)', { angle: 'rad' })).toBe(1);
    expect(calc('atan(1)', { angle: 'deg' })).toBe(45);
    expect(calc('acos(0)', { angle: 'deg' })).toBe(90);
    expect(calc('sen(30)')).toBeCloseTo(0.5, 12);
    expect(error('tan(90)', { angle: 'deg' })).toContain('tangente');
    expect(error('asin(2)')).toContain('arco-seno');
  });
  it('logaritmos, raízes e arredondamento', () => {
    expect(calc('log(1000)')).toBe(3);
    expect(calc('log(8;2)')).toBe(3);
    expect(calc('ln(e)')).toBe(1);
    expect(calc('log2(1024)')).toBe(10);
    expect(calc('sqrt(144)')).toBe(12);
    expect(calc('raiz(81)')).toBe(9);
    expect(calc('√9')).toBe(3);
    expect(calc('√(9+16)')).toBe(5);
    expect(calc('cbrt(27)')).toBe(3);
    expect(calc('round(2,675;2)')).toBe(2.68);
    expect(calc('round(2,5)')).toBe(3);
    expect(calc('floor(-1,5)')).toBe(-2);
    expect(calc('ceil(1,2)')).toBe(2);
    expect(calc('abs(-7)')).toBe(7);
    expect(calc('mod(-1;3)')).toBe(2);
    expect(calc('max(2;9;4)')).toBe(9);
    expect(calc('min(2;9;4)')).toBe(2);
    expect(calc('pow(2;10)')).toBe(1024);
  });
  it('constantes, ans e variáveis do usuário', () => {
    expect(calc('pi')).toBeCloseTo(3.14159265358979, 12);
    expect(calc('π')).toBeCloseTo(3.14159265358979, 12);
    expect(calc('2*ans', { ans: 21 })).toBe(42);
    expect(calc('P*(1+i)^n', { scope: new Map([['p', 1000], ['i', 0.01], ['n', 12]]) })).toBeCloseTo(1126.825, 3);
    expect(error('ans')).toContain('resultado anterior');
  });
});

describe('calculadora · erros claros em português, nunca exceção solta', () => {
  it('casos comuns', () => {
    expect(error('')).toContain('Digite');
    expect(error('   ')).toContain('Digite');
    expect(error('1/0')).toBe('Divisão por zero.');
    expect(error('0^-1')).toBe('Divisão por zero.');
    expect(error('(-8)^(1/2)')).toContain('real');
    expect(error('sqrt(-4)')).toContain('raiz quadrada');
    expect(error('ln(0)')).toContain('logaritmo');
    expect(error('2+')).toContain('incompleta');
    expect(error('(2+3')).toContain('parêntese');
    expect(error('2+3)')).toContain('fechado sem abertura');
    expect(error('()')).toContain('vazios');
    expect(error('2 3')).toContain('Falta um operador');
    expect(error('sin')).toContain('parênteses');
    expect(error('sin(1;2)')).toContain('argumento');
    expect(error('x+1')).toContain('Não conheço');
    expect(error('2;3')).toContain('ponto e vírgula');
    expect(error('10^400')).toContain('grande demais');
    expect(error('2@3')).toContain('Símbolo não reconhecido');
  });
  it('fechar parênteses automaticamente é opcional', () => {
    expect(error('(2+3')).toContain('parêntese');
    expect(calc('(2+3', { autoClose: true })).toBe(5);
    expect(calc('2*(3+(4', { autoClose: true })).toBe(14);
    expect(closeParentheses('((1')).toBe('((1))');
  });
  it('limites: tamanho e aninhamento', () => {
    expect(error('1+'.repeat(300))).toContain('passou de');
    expect(error('('.repeat(200) + '1' + ')'.repeat(200))).toContain('aninhada');
    expect(error('-'.repeat(200) + '1')).toContain('aninhada');
  });
});

describe('calculadora · segurança: texto nunca vira código', () => {
  const hostile = [
    'alert(1)', 'process.exit()', 'constructor', '__proto__', 'toString', 'hasOwnProperty', 'globalThis', 'window.location',
    '(()=>1)()', 'Function("return 1")()', 'eval("1")', 'import("x")', '`${1}`', '1;2', 'a=1', 'a.b', '"x"', "'x'", '{}', '[]', 'x=>x',
    'this', 'document.cookie', 'fetch("/")', 'require("fs")', '1+1;alert(1)', '</script><script>1</script>', '\u0000', 'constructor.constructor("return 1")()'
  ];
  for (const source of hostile) {
    it('recusa ' + JSON.stringify(source), () => {
      const result = tryCalculate(source, { scope: new Map([['p', 1]]) });
      expect(result.ok).toBe(false);
      expect(() => calculate(source)).toThrow(CalcError);
    });
  }
  it('o código da calculadora não usa eval nem Function', () => {
    for (const file of ['parser.ts', 'format.ts', 'model.ts']) {
      const code = readFileSync('src/apps/calculator/' + file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, file).not.toMatch(/\beval\s*\(/);
      expect(code, file).not.toMatch(/new\s+Function\b/);
      expect(code, file).not.toMatch(/\bFunction\s*\(/);
      expect(code, file).not.toMatch(/setTimeout\s*\(\s*['"`]/);
    }
  });
});
