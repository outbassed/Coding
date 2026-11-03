import type { CodeLang } from './model';

/**
 * Realce de sintaxe simples (sem dependências): devolve HTML seguro com <span class="t-..."> sobre o MESMO texto,
 * caractere por caractere, para ficar alinhado com o campo de edição que está por cima.
 */
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const span = (cls: string, s: string): string => (s ? '<span class="t-' + cls + '">' + esc(s) + '</span>' : '');

const JS_KEYWORDS = new Set(('async await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield').split(' '));
const JS_LITERALS = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity']);

export function highlightJs(src: string): string {
  let out = '';
  const re = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|`(?:[^`\\]|\\[\s\S])*`?)|(\b0[xX][0-9a-fA-F_]+\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?n?\b)|([A-Za-z_$][\w$]*)/g;
  let last = 0;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    out += esc(src.slice(last, m.index));
    if (m[1] !== undefined) out += span('c', m[0]);
    else if (m[2] !== undefined) out += span('s', m[0]);
    else if (m[3] !== undefined) out += span('n', m[0]);
    else {
      const w = m[4]!;
      out += JS_KEYWORDS.has(w) ? span('k', w) : JS_LITERALS.has(w) ? span('n', w) : esc(w);
    }
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  return out + esc(src.slice(last));
}

export function highlightCss(src: string): string {
  let out = '';
  let depth = 0;
  const re = /(\/\*[\s\S]*?(?:\*\/|$))|("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?)|(@[\w-]+)|(#[0-9a-fA-F]{3,8}\b)|(-?\d*\.?\d+(?:px|em|rem|%|vh|vw|vmin|vmax|s|ms|deg|fr|ch|ex|pt|cm|mm|in)?\b)|(![ \t]*important\b)|([A-Za-z_-][\w-]*)(\s*:)?|([{}])/g;
  let last = 0;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    out += esc(src.slice(last, m.index));
    if (m[1] !== undefined) out += span('c', m[0]);
    else if (m[2] !== undefined) out += span('s', m[0]);
    else if (m[3] !== undefined) out += span('k', m[0]);
    else if (m[4] !== undefined || m[5] !== undefined) out += span('n', m[0]);
    else if (m[6] !== undefined) out += span('k', m[0]);
    else if (m[7] !== undefined) {
      // dentro de { } um nome seguido de ":" é propriedade; fora, é parte do seletor
      if (depth > 0 && m[8] !== undefined && !src.startsWith('::', m.index + m[7].length)) out += span('p', m[7]) + esc(m[8]);
      else out += esc(m[0]);
    } else { depth = Math.max(0, depth + (m[9] === '{' ? 1 : -1)); out += esc(m[0]); }
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  return out + esc(src.slice(last));
}

export function highlightJson(src: string): string {
  let out = '';
  const re = /("(?:[^"\\\n]|\\.)*"?)(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;
  let last = 0;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    out += esc(src.slice(last, m.index));
    if (m[1] !== undefined) out += (m[2] !== undefined ? span('p', m[1]) + esc(m[2]) : span('s', m[1]));
    else if (m[3] !== undefined) out += span('n', m[3]);
    else out += span('k', m[4]!);
    last = m.index + m[0].length;
  }
  return out + esc(src.slice(last));
}

/** HTML/SVG/XML: comentários, tags, atributos e valores; o conteúdo de <script> e <style> usa o realce de JS e CSS. */
export function highlightHtml(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { out += esc(src.slice(i)); break; }
    out += esc(src.slice(i, lt));
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      const stop = end < 0 ? n : end + 3;
      out += span('c', src.slice(lt, stop)); i = stop; continue;
    }
    if (src.startsWith('<!', lt) || src.startsWith('<?', lt)) {
      const end = src.indexOf('>', lt);
      const stop = end < 0 ? n : end + 1;
      out += span('k', src.slice(lt, stop)); i = stop; continue;
    }
    const tag = /^<(\/?)([A-Za-z][\w:-]*)/.exec(src.slice(lt, lt + 80));
    if (!tag) { out += esc('<'); i = lt + 1; continue; }
    // lê a tag até o ">" respeitando aspas
    let j = lt + tag[0].length;
    let quote = '';
    while (j < n) {
      const ch = src[j]!;
      if (quote) { if (ch === quote) quote = ''; } else if (ch === '"' || ch === "'") quote = ch; else if (ch === '>') break;
      j++;
    }
    const closed = j < n;
    const rawEnd = closed ? j + 1 : n;
    const inner = src.slice(lt + tag[0].length, closed ? j : n);
    out += span('t', '<' + tag[1] + tag[2]!);
    let a = '';
    const attrRe = /([^\s=/>"']+)(\s*=\s*)?("[^"]*"?|'[^']*'?|[^\s"'>]+)?/g;
    let last = 0;
    for (let m = attrRe.exec(inner); m; m = attrRe.exec(inner)) {
      a += esc(inner.slice(last, m.index));
      a += span('p', m[1]!) + esc(m[2] ?? '') + (m[3] !== undefined ? span('s', m[3]) : '');
      last = m.index + m[0].length;
      if (m[0].length === 0) attrRe.lastIndex++;
    }
    a += esc(inner.slice(last));
    out += a;
    if (closed) out += span('t', '>');
    i = rawEnd;
    const name = tag[2]!.toLowerCase();
    if (!tag[1] && closed && (name === 'script' || name === 'style') && !/\/\s*$/.test(inner)) {
      const close = new RegExp('</' + name + '\\b', 'i');
      const rest = src.slice(i);
      const cm = close.exec(rest);
      const body = cm ? rest.slice(0, cm.index) : rest;
      out += name === 'script' ? (/\btype\s*=\s*["']?(?!module|text\/javascript|application\/javascript)[^"'\s>]*json/i.test(inner) ? highlightJson(body) : highlightJs(body)) : highlightCss(body);
      i += body.length;
    }
  }
  return out;
}

export function highlight(lang: CodeLang, text: string): string {
  switch (lang) {
    case 'js': return highlightJs(text);
    case 'css': return highlightCss(text);
    case 'json': return highlightJson(text);
    case 'html': case 'svg': return highlightHtml(text);
    default: return esc(text);
  }
}
/** Sem as marcações, o resultado é exatamente o texto de entrada (útil para testar o alinhamento). */
export const plainOf = (html: string): string => html.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
