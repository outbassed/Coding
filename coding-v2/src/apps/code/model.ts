/** Código: um projeto de página web com três arquivos (HTML, CSS e JavaScript), executado num quadro isolado. */
export type CodeFile = 'html' | 'css' | 'js';
export interface CodeState {
  name: string;
  html: string;
  css: string;
  js: string;
  /** Executa sozinho, um instante depois de parar de digitar. */
  auto: boolean;
  /** Espaços inseridos pela tecla Tab. */
  tabSize: 2 | 4;
}
export const MAX_FILE_CHARS = 400_000;
export const FILE_NAMES: Record<CodeFile, string> = { html: 'index.html', css: 'style.css', js: 'script.js' };
export const FILE_LABELS: Record<CodeFile, string> = { html: 'HTML', css: 'CSS', js: 'JavaScript' };
export const CODE_FILES: readonly CodeFile[] = ['html', 'css', 'js'];

const text = (v: unknown, d = ''): string => (typeof v === 'string' ? v.slice(0, MAX_FILE_CHARS) : d);

export function normalizeCode(raw: unknown): CodeState {
  const s = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  return {
    name: typeof s.name === 'string' && s.name.trim() ? s.name.slice(0, 250) : 'Projeto de código',
    html: text(s.html), css: text(s.css), js: text(s.js),
    auto: s.auto !== false,
    tabSize: s.tabSize === 4 ? 4 : 2
  };
}
export const blankCode = (name = 'Projeto de código'): CodeState => ({
  name, auto: true, tabSize: 2,
  html: '<!doctype html>\n<html lang="pt-BR">\n<head>\n  <meta charset="utf-8">\n  <title>Minha página</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>Olá, mundo!</h1>\n  <script src="script.js"></script>\n</body>\n</html>\n',
  css: 'body {\n  font-family: system-ui, sans-serif;\n  margin: 2rem;\n}\n',
  js: "console.log('Olá do JavaScript!');\n"
});
export const totalChars = (s: CodeState): number => s.html.length + s.css.length + s.js.length;
