/**
 * Código: um projeto de página web com vários arquivos e pastas (HTML, CSS, JavaScript, JSON, SVG, texto e imagens),
 * executado num quadro isolado. Projetos salvos na versão de três arquivos (html/css/js) são convertidos ao abrir.
 */
export type CodeLang = 'html' | 'css' | 'js' | 'json' | 'svg' | 'text';
export interface TextFile { path: string; text: string }
export interface AssetFile { path: string; blobId: string; mime: string; size: number }
export interface CodeState {
  name: string;
  files: TextFile[];
  /** Imagens, fontes e outros arquivos binários; os bytes ficam na Biblioteca, ligados pelo `blobId`. */
  assets: AssetFile[];
  /** Pastas vazias criadas de propósito (as outras existem pelos caminhos dos arquivos). */
  folders: string[];
  /** Arquivo de texto aberto no editor. */
  active: string;
  /** Abas abertas, em ordem. */
  open: string[];
  /** Página executada; vazio = index.html (ou a primeira página). */
  entry: string;
  /** Executa sozinho, um instante depois de parar de digitar. */
  auto: boolean;
  /** Espaços inseridos pela tecla Tab. */
  tabSize: 2 | 4;
}

export const MAX_FILE_CHARS = 400_000;
export const MAX_TOTAL_CHARS = 2_000_000;
export const MAX_FILES = 200;
export const MAX_ASSET_BYTES = 8 * 1024 * 1024;
export const MAX_ASSETS_TOTAL = 40 * 1024 * 1024;
export const MAX_DEPTH = 6;
export const MAX_PATH = 120;

export class CodeError extends Error {}

const TEXT_EXT = new Set(['html', 'htm', 'css', 'js', 'mjs', 'json', 'svg', 'txt', 'md', 'csv', 'xml', 'webmanifest']);
export const extOf = (path: string): string => { const m = /\.([a-z0-9]+)$/i.exec(path); return m ? m[1]!.toLowerCase() : ''; };
export const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
export const dirName = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
export const isTextPath = (path: string): boolean => TEXT_EXT.has(extOf(path));
export const isHtmlPath = (path: string): boolean => ['html', 'htm'].includes(extOf(path));
export function langOf(path: string): CodeLang {
  switch (extOf(path)) {
    case 'html': case 'htm': return 'html';
    case 'css': return 'css';
    case 'js': case 'mjs': return 'js';
    case 'json': case 'webmanifest': return 'json';
    case 'svg': case 'xml': return 'svg';
    default: return 'text';
  }
}
const MIME: Record<string, string> = {
  html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', webmanifest: 'application/manifest+json',
  svg: 'image/svg+xml', xml: 'application/xml', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf'
};
export const mimeOf = (path: string): string => MIME[extOf(path)] ?? 'application/octet-stream';
/** Extensões de binários aceitos como recurso (imagens, áudio, vídeo e fontes). */
export const isAssetPath = (path: string): boolean => !isTextPath(path) && extOf(path) in MIME;

/** Caminho limpo e seguro (sem "..", sem raiz, sem caracteres problemáticos) ou null se não servir. */
export function cleanPath(raw: string): string | null {
  const parts = String(raw).normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\\/g, '/').split('/').map((p) => p.trim()).filter((p) => p !== '' && p !== '.');
  if (!parts.length || parts.length > MAX_DEPTH + 1) return null;
  for (const p of parts) {
    if (p === '..' || /[<>:"|?*]/.test(p) || p.length > 80 || /^\.+$/.test(p)) return null;
  }
  const joined = parts.join('/');
  return joined.length > MAX_PATH ? null : joined;
}
const key = (path: string): string => path.toLowerCase();

const str = (v: unknown, max: number, d = ''): string => (typeof v === 'string' ? v.slice(0, max) : d);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export const STARTER_HTML = '<!doctype html>\n<html lang="pt-BR">\n<head>\n  <meta charset="utf-8">\n  <title>Minha página</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>Olá, mundo!</h1>\n  <script src="script.js"></script>\n</body>\n</html>\n';
export const STARTER_CSS = 'body {\n  font-family: system-ui, sans-serif;\n  margin: 2rem;\n}\n';
export const STARTER_JS = "console.log('Olá do JavaScript!');\n";

export function normalizeCode(raw: unknown): CodeState {
  const s = obj(raw);
  const files: TextFile[] = [];
  const assets: AssetFile[] = [];
  const taken = new Set<string>();
  const put = (path: string): boolean => { const k = key(path); if (taken.has(k) || taken.size >= MAX_FILES) return false; taken.add(k); return true; };
  let chars = 0;
  if (Array.isArray(s.files)) {
    for (const item of s.files) {
      const o = obj(item);
      const path = typeof o.path === 'string' ? cleanPath(o.path) : null;
      if (path && isTextPath(path) && chars < MAX_TOTAL_CHARS && put(path)) {
        const text = str(o.text, Math.min(MAX_FILE_CHARS, MAX_TOTAL_CHARS - chars));
        chars += text.length; files.push({ path, text });
      }
    }
    if (Array.isArray(s.assets)) {
      let total = 0;
      for (const item of s.assets) {
        const o = obj(item);
        const path = typeof o.path === 'string' ? cleanPath(o.path) : null;
        const size = Math.max(0, Math.floor(Number(o.size) || 0));
        if (!path || isTextPath(path) || typeof o.blobId !== 'string' || !o.blobId || size > MAX_ASSET_BYTES || total + size > MAX_ASSETS_TOTAL || !put(path)) continue;
        total += size;
        assets.push({ path, blobId: o.blobId.slice(0, 80), mime: typeof o.mime === 'string' ? o.mime.slice(0, 80) : mimeOf(path), size });
      }
    }
  } else if (typeof s.html === 'string' || typeof s.css === 'string' || typeof s.js === 'string') {
    // formato antigo (versão de três arquivos)
    for (const [path, v] of [['index.html', s.html], ['style.css', s.css], ['script.js', s.js]] as const) {
      put(path);
      const text = str(v, Math.min(MAX_FILE_CHARS, Math.max(0, MAX_TOTAL_CHARS - chars)));
      chars += text.length; files.push({ path, text });
    }
  }
  if (!files.length) files.push(...starterFiles());
  const folders: string[] = [];
  if (Array.isArray(s.folders)) {
    for (const f of s.folders) {
      const p = typeof f === 'string' ? cleanPath(f) : null;
      if (p && p.split('/').length <= MAX_DEPTH && !taken.has(key(p)) && !folders.some((x) => key(x) === key(p)) && folders.length < 100) folders.push(p);
    }
  }
  const paths = new Set(files.map((f) => f.path));
  const open = (Array.isArray(s.open) ? s.open : []).filter((p): p is string => typeof p === 'string' && paths.has(p)).filter((p, i, a) => a.indexOf(p) === i);
  let active = typeof s.active === 'string' && paths.has(s.active) ? s.active : (paths.has('index.html') ? 'index.html' : files[0]!.path);
  if (!open.includes(active)) open.push(active);
  if (!paths.has(active)) active = open[0]!;
  const entry = typeof s.entry === 'string' && paths.has(s.entry) && isHtmlPath(s.entry) ? s.entry : '';
  return {
    name: typeof s.name === 'string' && s.name.trim() ? s.name.slice(0, 250) : 'Projeto de código',
    files, assets, folders, active, open, entry,
    auto: s.auto !== false, tabSize: s.tabSize === 4 ? 4 : 2
  };
}
const starterFiles = (): TextFile[] => [{ path: 'index.html', text: STARTER_HTML }, { path: 'style.css', text: STARTER_CSS }, { path: 'script.js', text: STARTER_JS }];
export const blankCode = (name = 'Projeto de código'): CodeState => normalizeCode({ name });
/** Projeto de três arquivos (modelos e formato antigo). */
export const fromTriple = (t: { name: string; html: string; css: string; js: string; auto?: boolean; tabSize?: 2 | 4 }): CodeState =>
  normalizeCode({ name: t.name, html: t.html, css: t.css, js: t.js, auto: t.auto, tabSize: t.tabSize });

export const totalChars = (s: CodeState): number => s.files.reduce((n, f) => n + f.text.length, 0);
export const fileCount = (s: CodeState): number => s.files.length + s.assets.length;
export const textOf = (s: CodeState, path: string): string | undefined => s.files.find((f) => f.path === path)?.text;
export const hasPath = (s: CodeState, path: string): boolean => {
  const k = key(path);
  return s.files.some((f) => key(f.path) === k) || s.assets.some((a) => key(a.path) === k);
};
const hasFolder = (s: CodeState, path: string): boolean => {
  const k = key(path), prefix = k + '/';
  return s.folders.some((f) => key(f) === k) || s.files.some((f) => key(f.path).startsWith(prefix)) || s.assets.some((a) => key(a.path).startsWith(prefix));
};

/** Página executada: a escolhida, senão index.html, senão a primeira página HTML. */
export function entryPage(s: CodeState): string | null {
  if (s.entry && s.files.some((f) => f.path === s.entry)) return s.entry;
  const index = s.files.find((f) => f.path.toLowerCase() === 'index.html');
  if (index) return index.path;
  return s.files.find((f) => isHtmlPath(f.path))?.path ?? null;
}

// ---------------------------------------------------------------- operações (puras: devolvem um estado novo ou lançam CodeError)
function checkNew(s: CodeState, path: string, what: 'arquivo' | 'pasta'): void {
  if (hasPath(s, path) || hasFolder(s, path)) throw new CodeError('Já existe “' + path + '”. Escolha outro nome.');
  // um arquivo não pode ter como "pasta" o caminho de outro arquivo e vice-versa
  const parts = path.split('/');
  for (let i = 1; i < parts.length; i++) if (hasPath(s, parts.slice(0, i).join('/'))) throw new CodeError('“' + parts.slice(0, i).join('/') + '” é um arquivo; não pode ser usado como pasta.');
  if (what === 'pasta' && parts.length > MAX_DEPTH) throw new CodeError('Pastas podem ter no máximo ' + MAX_DEPTH + ' níveis.');
  if (fileCount(s) >= MAX_FILES && what === 'arquivo') throw new CodeError('Limite de ' + MAX_FILES + ' arquivos no projeto.');
}
export function addFile(s: CodeState, rawPath: string, text = ''): CodeState {
  const path = cleanPath(rawPath);
  if (!path) throw new CodeError('Nome inválido. Use letras, números, ponto, traço e / para pastas (sem “..” nem caracteres como : * ? " < > |).');
  if (!isTextPath(path)) throw new CodeError('Use uma extensão de texto: .html, .css, .js, .json, .svg, .txt, .md, .csv ou .xml. Imagens entram por “Importar arquivos”.');
  checkNew(s, path, 'arquivo');
  if (totalChars(s) + text.length > MAX_TOTAL_CHARS) throw new CodeError('O projeto passaria de ' + MAX_TOTAL_CHARS.toLocaleString('pt-BR') + ' caracteres.');
  const open = s.open.includes(path) ? s.open : [...s.open, path];
  return { ...s, files: [...s.files, { path, text: text.slice(0, MAX_FILE_CHARS) }], active: path, open };
}
export function addFolder(s: CodeState, rawPath: string): CodeState {
  const path = cleanPath(rawPath);
  if (!path) throw new CodeError('Nome de pasta inválido.');
  checkNew(s, path, 'pasta');
  return { ...s, folders: [...s.folders, path] };
}
export function removeFile(s: CodeState, path: string): CodeState {
  const files = s.files.filter((f) => f.path !== path);
  const assets = s.assets.filter((a) => a.path !== path);
  if (files.length === s.files.length && assets.length === s.assets.length) throw new CodeError('Esse arquivo não existe mais.');
  if (!files.length) throw new CodeError('O projeto precisa ter pelo menos um arquivo de texto.');
  return fix({ ...s, files, assets });
}
export function removeFolder(s: CodeState, path: string): CodeState {
  if (!path || !hasFolder(s, path)) throw new CodeError('Essa pasta não existe mais.');
  const prefix = path + '/';
  const files = s.files.filter((f) => !f.path.startsWith(prefix));
  if (!files.length) throw new CodeError('O projeto precisa ter pelo menos um arquivo de texto.');
  return fix({
    ...s, files, assets: s.assets.filter((a) => !a.path.startsWith(prefix)),
    folders: s.folders.filter((f) => f !== path && !f.startsWith(prefix))
  });
}
/** Mantém aba aberta, arquivo ativo e página executada coerentes depois de remover/renomear. */
function fix(s: CodeState): CodeState {
  const paths = new Set(s.files.map((f) => f.path));
  const open = s.open.filter((p) => paths.has(p));
  let active = paths.has(s.active) ? s.active : (open[open.length - 1] ?? '');
  if (!active) active = s.files.find((f) => f.path.toLowerCase() === 'index.html')?.path ?? s.files[0]?.path ?? '';
  if (active && !open.includes(active)) open.push(active);
  return { ...s, open, active, entry: paths.has(s.entry) ? s.entry : '' };
}
export function renamePath(s: CodeState, from: string, rawTo: string): CodeState {
  const to = cleanPath(rawTo);
  if (!to) throw new CodeError('Nome inválido.');
  if (to === from) return s;
  const isFile = hasPath(s, from);
  const isDir = !isFile && hasFolder(s, from);
  if (!isFile && !isDir) throw new CodeError('Esse item não existe mais.');
  if (isFile) {
    if (isTextPath(from) !== isTextPath(to)) throw new CodeError('A extensão precisa continuar do mesmo tipo (texto ou recurso).');
    if (key(to) !== key(from)) checkNew(s, to, 'arquivo');
    const mv = (p: string): string => (p === from ? to : p);
    return fix({ ...s, files: s.files.map((f) => ({ ...f, path: mv(f.path) })), assets: s.assets.map((a) => ({ ...a, path: mv(a.path) })), open: s.open.map(mv), active: mv(s.active), entry: mv(s.entry) });
  }
  if (to.startsWith(from + '/')) throw new CodeError('Uma pasta não pode ser movida para dentro dela mesma.');
  if (key(to) !== key(from)) checkNew(s, to, 'pasta');
  const prefix = from + '/';
  const mv = (p: string): string => (p.startsWith(prefix) ? to + '/' + p.slice(prefix.length) : p);
  const depthOk = [...s.files.map((f) => mv(f.path)), ...s.assets.map((a) => mv(a.path))].every((p) => p.split('/').length <= MAX_DEPTH + 1 && p.length <= MAX_PATH);
  if (!depthOk) throw new CodeError('O novo caminho deixaria algum arquivo fundo ou comprido demais.');
  return fix({
    ...s, files: s.files.map((f) => ({ ...f, path: mv(f.path) })), assets: s.assets.map((a) => ({ ...a, path: mv(a.path) })),
    folders: s.folders.map((f) => (f === from ? to : mv(f))), open: s.open.map(mv), active: mv(s.active), entry: mv(s.entry)
  });
}

// ---------------------------------------------------------------- árvore para a lista de arquivos
export interface TreeRow { kind: 'dir' | 'file'; path: string; name: string; depth: number; asset: boolean; size?: number }
export function treeRows(s: CodeState, collapsed: ReadonlySet<string> = new Set()): TreeRow[] {
  const dirs = new Set<string>();
  const add = (p: string): void => { const parts = p.split('/'); for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/')); };
  for (const f of s.files) add(f.path);
  for (const a of s.assets) add(a.path);
  for (const d of s.folders) { dirs.add(d); add(d + '/x'); }
  const entries: { path: string; dir: boolean; asset: boolean; size?: number }[] = [
    ...[...dirs].map((path) => ({ path, dir: true, asset: false })),
    ...s.files.map((f) => ({ path: f.path, dir: false, asset: false, size: f.text.length })),
    ...s.assets.map((a) => ({ path: a.path, dir: false, asset: true, size: a.size }))
  ];
  const children = (parent: string): typeof entries => entries
    .filter((e) => dirName(e.path) === parent)
    .sort((a, b) => (a.dir === b.dir ? baseName(a.path).localeCompare(baseName(b.path), 'pt-BR', { numeric: true, sensitivity: 'base' }) : a.dir ? -1 : 1));
  const rows: TreeRow[] = [];
  const walk = (parent: string, depth: number): void => {
    for (const e of children(parent)) {
      rows.push({ kind: e.dir ? 'dir' : 'file', path: e.path, name: baseName(e.path), depth, asset: e.asset, size: e.size });
      if (e.dir && !collapsed.has(e.path)) walk(e.path, depth + 1);
    }
  };
  walk('', 0);
  return rows;
}

/** Caminho relativo `href` visto a partir do arquivo `from`, normalizado (ou null se sair da raiz ou for externo). */
export function resolveRef(from: string, href: string): string | null {
  const clean = href.trim().split('#')[0]!.split('?')[0]!;
  if (!clean || /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(clean)) return null;
  const base = clean.startsWith('/') ? [] : dirName(from).split('/').filter(Boolean);
  for (const part of clean.replace(/^\//, '').split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') { if (!base.length) return null; base.pop(); continue; }
    base.push(decodeURIComponentSafe(part));
  }
  return base.join('/') || null;
}
function decodeURIComponentSafe(v: string): string { try { return decodeURIComponent(v); } catch { return v; } }

// ---------------------------------------------------------------- importação
export type ConflictMode = 'keep' | 'replace';
/** “a.js” → “a (2).js” até não existir. */
export function uniquePath(s: CodeState, path: string): string {
  if (!hasPath(s, path) && !hasFolder(s, path)) return path;
  const dir = dirName(path), base = baseName(path);
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base, ext = dot > 0 ? base.slice(dot) : '';
  for (let i = 2; i < 1000; i++) {
    const p = (dir ? dir + '/' : '') + stem + ' (' + i + ')' + ext;
    if (!hasPath(s, p) && !hasFolder(s, p)) return p;
  }
  throw new CodeError('Não foi possível achar um nome livre para “' + path + '”.');
}
export interface Imported { state: CodeState; path: string; replaced: boolean; droppedBlobId?: string }
/** Põe um arquivo de texto no projeto. Se o nome já existir: `replace` troca o conteúdo; `keep` guarda os dois (o novo ganha “(2)”). */
export function importText(s: CodeState, rawPath: string, text: string, mode: ConflictMode): Imported {
  const clean = cleanPath(rawPath);
  if (!clean || !isTextPath(clean)) throw new CodeError('“' + rawPath + '” não é um arquivo de texto aceito.');
  const body = text.slice(0, MAX_FILE_CHARS);
  const same = s.files.find((f) => key(f.path) === key(clean));
  if (totalChars(s) - (same && mode === 'replace' ? same.text.length : 0) + body.length > MAX_TOTAL_CHARS) throw new CodeError('O projeto passaria de ' + MAX_TOTAL_CHARS.toLocaleString('pt-BR') + ' caracteres.');
  if (same && mode === 'replace') return { state: { ...s, files: s.files.map((f) => (f === same ? { ...f, text: body } : f)) }, path: same.path, replaced: true };
  const path = uniquePath(s, clean);
  if (fileCount(s) >= MAX_FILES) throw new CodeError('Limite de ' + MAX_FILES + ' arquivos no projeto.');
  return { state: { ...s, files: [...s.files, { path, text: body }] }, path, replaced: false };
}
/** Põe um recurso binário (imagem, fonte, áudio, vídeo) no projeto; os bytes ficam guardados à parte, ligados por `blobId`. */
export function importAsset(s: CodeState, rawPath: string, meta: { blobId: string; mime?: string; size: number }, mode: ConflictMode): Imported {
  const clean = cleanPath(rawPath);
  if (!clean || !isAssetPath(clean)) throw new CodeError('“' + rawPath + '” não é um tipo de recurso aceito (imagem, áudio, vídeo ou fonte).');
  if (meta.size > MAX_ASSET_BYTES) throw new CodeError('“' + clean + '” passa de ' + Math.round(MAX_ASSET_BYTES / 1048576) + ' MB.');
  const same = s.assets.find((a) => key(a.path) === key(clean));
  const others = s.assets.filter((a) => a !== same).reduce((n, a) => n + a.size, 0);
  if (others + meta.size > MAX_ASSETS_TOTAL) throw new CodeError('Os recursos do projeto passariam de ' + Math.round(MAX_ASSETS_TOTAL / 1048576) + ' MB.');
  const asset = (path: string): AssetFile => ({ path, blobId: meta.blobId, mime: meta.mime || mimeOf(path), size: meta.size });
  if (same && mode === 'replace') return { state: { ...s, assets: s.assets.map((a) => (a === same ? asset(same.path) : a)) }, path: same.path, replaced: true, droppedBlobId: same.blobId };
  const path = uniquePath(s, clean);
  if (fileCount(s) >= MAX_FILES) throw new CodeError('Limite de ' + MAX_FILES + ' arquivos no projeto.');
  return { state: { ...s, assets: [...s.assets, asset(path)] }, path, replaced: false };
}
