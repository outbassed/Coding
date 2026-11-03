/** Leitor XML mínimo (sem DTD/entidades externas — seguro contra XXE) para XLSX/DOCX. */
export interface XNode { name: string; attrs: Record<string, string>; children: XNode[]; text: string }

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    return ENT[e.toLowerCase()] ?? '';
  });
}
export const escapeXml = (text: string): string =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
    // caracteres de controle proibidos em XML 1.0
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

/** Remove o prefixo de namespace (x:row → row). */
const local = (name: string): string => { const i = name.indexOf(':'); return i >= 0 ? name.slice(i + 1) : name; };

export function parseXml(source: string): XNode {
  const root: XNode = { name: '#root', attrs: {}, children: [], text: '' };
  const stack: XNode[] = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const top = stack[stack.length - 1]!;
    if (m[1] !== undefined) { top.text += m[1]; continue; }
    if (m[2] !== undefined) { if (stack.length > 1) stack.pop(); continue; }
    if (m[3] !== undefined) {
      const attrs: Record<string, string> = {};
      const ar = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      let a: RegExpExecArray | null;
      while ((a = ar.exec(m[4] ?? ''))) attrs[local(a[1]!)] = decodeEntities(a[2] ?? a[3] ?? '');
      const node: XNode = { name: local(m[3]), attrs, children: [], text: '' };
      top.children.push(node);
      if (m[5] !== '/') stack.push(node);
      continue;
    }
    if (m[6] !== undefined) top.text += decodeEntities(m[6]);
  }
  return root;
}
export const child = (node: XNode | undefined, name: string): XNode | undefined => node?.children.find((c) => c.name === name);
export const childrenOf = (node: XNode | undefined, name: string): XNode[] => node?.children.filter((c) => c.name === name) ?? [];
/** Texto de todos os descendentes <t> (sharedStrings com formatação rica). */
export function allText(node: XNode, tag = 't'): string {
  if (node.name === tag) return node.text;
  return node.children.map((c) => allText(c, tag)).join('');
}
