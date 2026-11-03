/**
 * Modelos 3D (STL, OBJ e GLB) lidos e desenhados sem biblioteca externa. A malha vira uma lista de triângulos soltos
 * (x,y,z × 3 por triângulo); o desenho é um renderizador em Canvas 2D (ordem de trás para frente, luz fixa), suficiente
 * para girar, aproximar e conferir peças. Quem lê nunca confia no arquivo: contagens e índices são validados.
 */
export class MeshError extends Error {}
export const MAX_TRIANGLES = 1_500_000;
export interface Mesh { positions: Float32Array; triangles: number }

function finish(values: number[] | Float32Array): Mesh {
  const positions = values instanceof Float32Array ? values : Float32Array.from(values);
  const triangles = Math.floor(positions.length / 9);
  if (triangles === 0) throw new MeshError('O arquivo não tem nenhum triângulo para mostrar.');
  for (let i = 0; i < triangles * 9; i++) if (!Number.isFinite(positions[i])) throw new MeshError('O modelo tem coordenadas inválidas.');
  return { positions: positions.length === triangles * 9 ? positions : positions.subarray(0, triangles * 9), triangles };
}

// ------------------------------------------------------------------ STL
function isBinaryStl(bytes: Uint8Array): boolean {
  if (bytes.length < 84) return false;
  const count = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true);
  if (84 + count * 50 === bytes.length) return true;
  // ASCII começa com "solid" e contém "facet"; senão trata como binário (alguns exportadores escrevem "solid" no cabeçalho)
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 1024)));
  return !(/^\s*solid/i.test(head) && /facet/i.test(head));
}
export function parseStl(bytes: Uint8Array): Mesh {
  if (isBinaryStl(bytes)) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = dv.getUint32(80, true);
    if (count > MAX_TRIANGLES) throw new MeshError('O modelo passa de ' + MAX_TRIANGLES.toLocaleString('pt-BR') + ' triângulos.');
    if (84 + count * 50 > bytes.length) throw new MeshError('O STL está incompleto (menos triângulos do que o cabeçalho diz).');
    const out = new Float32Array(count * 9);
    for (let i = 0; i < count; i++) {
      const base = 84 + i * 50 + 12; // pula a normal
      for (let k = 0; k < 9; k++) out[i * 9 + k] = dv.getFloat32(base + k * 4, true);
    }
    return finish(out);
  }
  const text = new TextDecoder('latin1').decode(bytes);
  const out: number[] = [];
  const re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    out.push(Number(m[1]), Number(m[2]), Number(m[3]));
    if (out.length / 9 > MAX_TRIANGLES) throw new MeshError('O modelo passa de ' + MAX_TRIANGLES.toLocaleString('pt-BR') + ' triângulos.');
  }
  if (out.length % 9 !== 0) throw new MeshError('O STL de texto tem vértices que não formam triângulos completos.');
  return finish(out);
}

// ------------------------------------------------------------------ OBJ
export function parseObj(text: string): Mesh {
  const verts: number[] = [];
  const out: number[] = [];
  const index = (token: string): number => {
    const raw = Number.parseInt(token.split('/')[0] ?? '', 10);
    if (!Number.isFinite(raw) || raw === 0) throw new MeshError('Índice inválido no OBJ.');
    const n = raw > 0 ? raw - 1 : verts.length / 3 + raw;
    if (n < 0 || n >= verts.length / 3) throw new MeshError('O OBJ aponta para um vértice que não existe.');
    return n * 3;
  };
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('v ')) {
      const p = line.trim().split(/\s+/);
      verts.push(Number(p[1]), Number(p[2]), Number(p[3]));
    } else if (line.startsWith('f ')) {
      const p = line.trim().split(/\s+/).slice(1);
      if (p.length < 3) continue;
      const ids = p.map(index);
      for (let i = 1; i < ids.length - 1; i++) {
        for (const id of [ids[0]!, ids[i]!, ids[i + 1]!]) out.push(verts[id]!, verts[id + 1]!, verts[id + 2]!);
        if (out.length / 9 > MAX_TRIANGLES) throw new MeshError('O modelo passa de ' + MAX_TRIANGLES.toLocaleString('pt-BR') + ' triângulos.');
      }
    }
  }
  return finish(out);
}

// ------------------------------------------------------------------ GLB
type Mat = number[]; // 4×4, coluna principal (como no glTF)
const IDENT: Mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a: Mat, b: Mat): Mat {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!; o[c * 4 + r] = s; }
  return o;
}
function trs(t: number[], q: number[], s: number[]): Mat {
  const [x, y, z, w] = q as [number, number, number, number];
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [
    (1 - 2 * (yy + zz)) * s[0]!, 2 * (xy + wz) * s[0]!, 2 * (xz - wy) * s[0]!, 0,
    2 * (xy - wz) * s[1]!, (1 - 2 * (xx + zz)) * s[1]!, 2 * (yz + wx) * s[1]!, 0,
    2 * (xz + wy) * s[2]!, 2 * (yz - wx) * s[2]!, (1 - 2 * (xx + yy)) * s[2]!, 0,
    t[0]!, t[1]!, t[2]!, 1
  ];
}
interface Gltf {
  scene?: number; scenes?: { nodes?: number[] }[]; nodes?: { mesh?: number; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }[];
  meshes?: { primitives?: { attributes?: { POSITION?: number }; indices?: number; mode?: number; extensions?: Record<string, unknown> }[] }[];
  accessors?: { bufferView?: number; byteOffset?: number; componentType?: number; count?: number; type?: string; normalized?: boolean; sparse?: unknown }[];
  bufferViews?: { buffer?: number; byteOffset?: number; byteLength?: number; byteStride?: number }[];
  buffers?: { uri?: string; byteLength?: number }[];
  extensionsRequired?: string[];
}
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function parseGlb(bytes: Uint8Array): Mesh {
  if (bytes.length < 20) throw new MeshError('Arquivo GLB incompleto.');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new MeshError('Não é um arquivo GLB (assinatura glTF ausente).');
  if (dv.getUint32(4, true) !== 2) throw new MeshError('Só o glTF 2.0 é aceito.');
  const total = Math.min(dv.getUint32(8, true), bytes.length);
  let json: Gltf | null = null;
  let bin: Uint8Array | null = null;
  for (let at = 12; at + 8 <= total;) {
    const len = dv.getUint32(at, true), type = dv.getUint32(at + 4, true);
    const start = at + 8, end = start + len;
    if (end > total) throw new MeshError('Bloco do GLB passa do fim do arquivo.');
    if (type === 0x4e4f534a) {
      try { json = JSON.parse(new TextDecoder().decode(bytes.subarray(start, end))) as Gltf; } catch { throw new MeshError('O JSON do GLB está corrompido.'); }
    } else if (type === 0x004e4942 && !bin) bin = bytes.subarray(start, end);
    at = end + ((4 - (len % 4)) % 4);
  }
  if (!json) throw new MeshError('GLB sem o bloco JSON.');
  if (json.extensionsRequired?.length) throw new MeshError('Este GLB usa extensões (' + json.extensionsRequired.slice(0, 3).join(', ') + ') que o Visualizador não lê.');
  const meshes = json.meshes ?? [], nodes = json.nodes ?? [], accessors = json.accessors ?? [], views = json.bufferViews ?? [];
  if (!bin) throw new MeshError('GLB sem dados binários.');
  const binary = bin;
  const out: number[] = [];

  const read = (index: number, wantVec3: boolean): { get: (i: number, k: number) => number; count: number } => {
    const acc = accessors[index];
    if (!acc || acc.sparse || acc.bufferView === undefined) throw new MeshError('Acessor não suportado no GLB.');
    const view = views[acc.bufferView];
    if (!view || (view.buffer ?? 0) !== 0) throw new MeshError('Buffer do GLB não suportado.');
    const count = Math.floor(num(acc.count));
    const comps = acc.type === 'VEC3' ? 3 : acc.type === 'SCALAR' ? 1 : 0;
    if (!comps || (wantVec3 && comps !== 3)) throw new MeshError('Tipo de dado inesperado no GLB.');
    const ct = num(acc.componentType);
    const size = ct === 5126 || ct === 5125 ? 4 : ct === 5123 ? 2 : ct === 5121 ? 1 : 0;
    if (!size) throw new MeshError('Formato numérico do GLB não suportado.');
    if (wantVec3 && (ct !== 5126 || acc.normalized)) throw new MeshError('Posições comprimidas ou normalizadas não são suportadas.');
    const stride = num(view.byteStride) || size * comps;
    const base = num(view.byteOffset) + num(acc.byteOffset);
    if (count < 0 || base + (count > 0 ? (count - 1) * stride + size * comps : 0) > binary.length) throw new MeshError('Dados do GLB passam do fim do arquivo.');
    const bdv = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
    const get = (i: number, k: number): number => {
      const p = base + i * stride + k * size;
      return ct === 5126 ? bdv.getFloat32(p, true) : ct === 5125 ? bdv.getUint32(p, true) : ct === 5123 ? bdv.getUint16(p, true) : bdv.getUint8(p);
    };
    return { get, count };
  };

  const addMesh = (mi: number, m: Mat): void => {
    for (const prim of meshes[mi]?.primitives ?? []) {
      if (prim.extensions && 'KHR_draco_mesh_compression' in prim.extensions) throw new MeshError('Malha comprimida com Draco não é suportada.');
      if ((prim.mode ?? 4) !== 4 || prim.attributes?.POSITION === undefined) continue;
      const pos = read(prim.attributes.POSITION, true);
      const idx = prim.indices !== undefined ? read(prim.indices, false) : null;
      const n = idx ? idx.count : pos.count;
      for (let i = 0; i + 2 < n; i += 3) {
        for (let j = 0; j < 3; j++) {
          const v = idx ? idx.get(i + j, 0) : i + j;
          if (v >= pos.count) throw new MeshError('Índice fora do alcance no GLB.');
          const x = pos.get(v, 0), y = pos.get(v, 1), z = pos.get(v, 2);
          out.push(m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!);
        }
        if (out.length / 9 > MAX_TRIANGLES) throw new MeshError('O modelo passa de ' + MAX_TRIANGLES.toLocaleString('pt-BR') + ' triângulos.');
      }
    }
  };
  let visited = 0;
  const visit = (ni: number, parent: Mat, depth: number): void => {
    const node = nodes[ni];
    if (!node || depth > 32 || ++visited > 5000) return;
    const local = node.matrix && node.matrix.length === 16 ? node.matrix.map((v) => num(v)) : trs(node.translation ?? [0, 0, 0], node.rotation ?? [0, 0, 0, 1], node.scale ?? [1, 1, 1]);
    const world = mul(parent, local);
    if (node.mesh !== undefined) addMesh(node.mesh, world);
    for (const c of node.children ?? []) visit(c, world, depth + 1);
  };
  const roots = json.scenes?.[json.scene ?? 0]?.nodes;
  if (roots) for (const r of roots) visit(r, IDENT, 0);
  else for (let i = 0; i < meshes.length; i++) addMesh(i, IDENT);
  return finish(out);
}

export function parseModel(name: string, bytes: Uint8Array): Mesh {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  if (bytes.length >= 4 && String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!) === 'glTF') return parseGlb(bytes);
  if (ext === 'obj') return parseObj(new TextDecoder().decode(bytes));
  if (ext === 'stl') return parseStl(bytes);
  if (ext === 'glb') return parseGlb(bytes);
  throw new MeshError('Formato 3D não reconhecido. Use STL, OBJ ou GLB.');
}

// ------------------------------------------------------------------ desenho
export interface Camera { yaw: number; pitch: number; zoom: number }
export const defaultCamera = (): Camera => ({ yaw: -0.6, pitch: 0.45, zoom: 1 });
export interface Bounds { cx: number; cy: number; cz: number; radius: number; sx: number; sy: number; sz: number }
export function boundsOf(mesh: Mesh): Bounds {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  const p = mesh.positions;
  for (let i = 0; i < mesh.triangles * 9; i += 3) {
    const x = p[i]!, y = p[i + 1]!, z = p[i + 2]!;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  const sx = x1 - x0, sy = y1 - y0, sz = z1 - z0;
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, cz: (z0 + z1) / 2, radius: Math.max(1e-9, Math.hypot(sx, sy, sz) / 2), sx, sy, sz };
}

export interface Projected { order: Uint32Array; sx: Float32Array; sy: Float32Array; shade: Float32Array; drawn: number }
/**
 * Projeta os triângulos (ortográfica) na câmera e ordena de trás para frente. `limit` reduz a quantidade desenhada
 * (amostragem uniforme) enquanto a pessoa arrasta, para manter a fluidez.
 */
export function project(mesh: Mesh, b: Bounds, cam: Camera, width: number, height: number, limit = Infinity): Projected {
  const step = Math.max(1, Math.ceil(mesh.triangles / limit));
  const n = Math.ceil(mesh.triangles / step);
  const sx = new Float32Array(n * 3), sy = new Float32Array(n * 3), shade = new Float32Array(n), depth = new Float32Array(n);
  const cy = Math.cos(cam.yaw), sY = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const scale = (Math.min(width, height) / 2 / b.radius) * 0.86 * cam.zoom;
  const p = mesh.positions;
  const tx = new Float64Array(3), ty = new Float64Array(3), tz = new Float64Array(3);
  let k = 0;
  for (let t = 0; t < mesh.triangles; t += step, k++) {
    for (let v = 0; v < 3; v++) {
      const i = t * 9 + v * 3;
      const x = p[i]! - b.cx, y = p[i + 1]! - b.cy, z = p[i + 2]! - b.cz;
      // gira em torno do eixo vertical (yaw) e depois inclina (pitch); o eixo Z do modelo aponta para cima
      const x1 = x * cy - y * sY, y1 = x * sY + y * cy;
      tx[v] = x1; ty[v] = y1 * cp - z * sp; tz[v] = y1 * sp + z * cp;
      sx[k * 3 + v] = width / 2 + x1 * scale;
      sy[k * 3 + v] = height / 2 - tz[v]! * scale;
    }
    const ux = tx[1]! - tx[0]!, uy = ty[1]! - ty[0]!, uz = tz[1]! - tz[0]!, wx = tx[2]! - tx[0]!, wy = ty[2]! - ty[0]!, wz = tz[2]! - tz[0]!;
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    // luz vinda da câmera, um pouco acima e à esquerda; vale para os dois lados da face (malhas com orientação mista)
    const lit = Math.abs(nx * -0.35 + ny * -0.55 + nz * 0.76);
    shade[k] = 0.18 + 0.82 * lit;
    depth[k] = (ty[0]! + ty[1]! + ty[2]!) / 3;
  }
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  // mais distante primeiro (y maior = mais longe da câmera após a inclinação)
  order.sort((a, c) => depth[c]! - depth[a]!);
  return { order, sx, sy, shade, drawn: n };
}
export interface DrawOptions { wireframe: boolean; color: [number, number, number]; background: string }
export function drawMesh(ctx: CanvasRenderingContext2D, mesh: Mesh, b: Bounds, cam: Camera, width: number, height: number, opts: DrawOptions, limit = Infinity): number {
  ctx.fillStyle = opts.background;
  ctx.fillRect(0, 0, width, height);
  const pr = project(mesh, b, cam, width, height, limit);
  ctx.lineJoin = 'round';
  for (let q = 0; q < pr.order.length; q++) {
    const i = pr.order[q]!;
    const s = pr.shade[i]!;
    ctx.beginPath();
    ctx.moveTo(pr.sx[i * 3]!, pr.sy[i * 3]!);
    ctx.lineTo(pr.sx[i * 3 + 1]!, pr.sy[i * 3 + 1]!);
    ctx.lineTo(pr.sx[i * 3 + 2]!, pr.sy[i * 3 + 2]!);
    ctx.closePath();
    if (opts.wireframe) { ctx.strokeStyle = 'rgb(' + Math.round(opts.color[0] * s) + ',' + Math.round(opts.color[1] * s) + ',' + Math.round(opts.color[2] * s) + ')'; ctx.lineWidth = 1; ctx.stroke(); }
    else {
      const fill = 'rgb(' + Math.round(opts.color[0] * s) + ',' + Math.round(opts.color[1] * s) + ',' + Math.round(opts.color[2] * s) + ')';
      ctx.fillStyle = fill; ctx.strokeStyle = fill; ctx.lineWidth = 0.6; ctx.fill(); ctx.stroke(); // o contorno fecha frestas entre triângulos
    }
  }
  return pr.drawn;
}
