import { describe, expect, it } from 'vitest';
import { boundsOf, defaultCamera, drawMesh, MeshError, parseGlb, parseModel, parseObj, parseStl, project, type Mesh } from './mesh';

const CUBE_OBJ = `# cubo
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
v 0 0 1
v 1 0 1
v 1 1 1
v 0 1 1
f 1 2 3 4
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
`;

function binaryStl(tris: number[][]): Uint8Array {
  const out = new Uint8Array(84 + tris.length * 50);
  const dv = new DataView(out.buffer);
  dv.setUint32(80, tris.length, true);
  tris.forEach((t, i) => t.forEach((v, k) => dv.setFloat32(84 + i * 50 + 12 + k * 4, v, true)));
  return out;
}
function glb(json: object, bin: Uint8Array): Uint8Array {
  const j = new TextEncoder().encode(JSON.stringify(json));
  const jPad = (4 - (j.length % 4)) % 4, bPad = (4 - (bin.length % 4)) % 4;
  const total = 12 + 8 + j.length + jPad + 8 + bin.length + bPad;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, j.length + jPad, true); dv.setUint32(16, 0x4e4f534a, true);
  out.set(j, 20); out.fill(0x20, 20 + j.length, 20 + j.length + jPad);
  const bAt = 20 + j.length + jPad;
  dv.setUint32(bAt, bin.length + bPad, true); dv.setUint32(bAt + 4, 0x004e4942, true);
  out.set(bin, bAt + 8);
  return out;
}
const triGlb = (extraNode: object = {}): Uint8Array => {
  const bin = new Uint8Array(36);
  new Float32Array(bin.buffer).set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  return glb({
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, ...extraNode }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }], buffers: [{ byteLength: 36 }]
  }, bin);
};

describe('3D · STL', () => {
  it('binário', () => {
    const m = parseStl(binaryStl([[0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 0, 1, 1, 0, 1, 0, 1, 1]]));
    expect(m.triangles).toBe(2);
    expect(Array.from(m.positions.subarray(0, 6))).toEqual([0, 0, 0, 1, 0, 0]);
  });
  it('texto (ASCII)', () => {
    const text = 'solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1e0 0 0\nvertex 0 -1.5 0\nendloop\nendfacet\nendsolid t\n';
    const m = parseStl(new TextEncoder().encode(text));
    expect(m.triangles).toBe(1);
    expect(m.positions[7]).toBeCloseTo(-1.5);
  });
  it('recusa binário incompleto, vazio e coordenadas inválidas', () => {
    const bytes = binaryStl([[0, 0, 0, 1, 0, 0, 0, 1, 0]]);
    expect(() => parseStl(bytes.subarray(0, bytes.length - 10))).toThrow(MeshError);
    const lying = binaryStl([]);
    new DataView(lying.buffer).setUint32(80, 5, true);
    expect(() => parseStl(lying)).toThrow(/incompleto/);
    expect(() => parseStl(binaryStl([]))).toThrow(/nenhum triângulo/);
    expect(() => parseStl(binaryStl([[NaN, 0, 0, 1, 0, 0, 0, 1, 0]]))).toThrow(/inválidas/);
  });
});

describe('3D · OBJ', () => {
  it('quadriláteros viram dois triângulos (cubo = 12)', () => { expect(parseObj(CUBE_OBJ).triangles).toBe(12); });
  it('índices negativos, barras v/vt/vn e CRLF', () => {
    const m = parseObj('v 0 0 0\r\nv 1 0 0\r\nv 0 1 0\r\nf -3/1/1 -2/2/1 -1/3/1\r\n');
    expect(m.triangles).toBe(1);
    expect(Array.from(m.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  });
  it('recusa índice inexistente', () => {
    expect(() => parseObj('v 0 0 0\nf 1 2 3\n')).toThrow(/não existe/);
    expect(() => parseObj('v 0 0 0\nf 0 1 1\n')).toThrow(/inválido/);
  });
});

describe('3D · GLB', () => {
  it('lê um triângulo', () => {
    const m = parseGlb(triGlb());
    expect(m.triangles).toBe(1);
    expect(Array.from(m.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  });
  it('aplica a transformação do nó (translação e escala)', () => {
    const m = parseGlb(triGlb({ translation: [10, 0, 0], scale: [2, 2, 2] }));
    expect(Array.from(m.positions)).toEqual([10, 0, 0, 12, 0, 0, 10, 2, 0]);
  });
  it('recusa assinatura errada, versão e extensões exigidas', () => {
    expect(() => parseGlb(new Uint8Array(40))).toThrow(/GLB/);
    const bin = new Uint8Array(36);
    const compressed = glb({ asset: { version: '2.0' }, extensionsRequired: ['KHR_draco_mesh_compression'], meshes: [] }, bin);
    expect(() => parseGlb(compressed)).toThrow(/extensões/);
  });
  it('recusa acessor que passa do fim dos dados', () => {
    const bin = new Uint8Array(12);
    const bad = glb({
      asset: { version: '2.0' }, meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }], bufferViews: [{ buffer: 0, byteLength: 36 }], buffers: [{ byteLength: 36 }]
    }, bin);
    expect(() => parseGlb(bad)).toThrow(/passam do fim/);
  });
  it('parseModel escolhe pelo conteúdo e pela extensão', () => {
    expect(parseModel('x.bin', triGlb()).triangles).toBe(1);
    expect(parseModel('cubo.obj', new TextEncoder().encode(CUBE_OBJ)).triangles).toBe(12);
    expect(() => parseModel('x.xyz', new Uint8Array(100))).toThrow(/não reconhecido/);
  });
});

describe('3D · projeção e desenho', () => {
  const two: Mesh = { positions: Float32Array.from([0, -1, 0, 1, -1, 0, 0, -1, 1, /* perto */ 0, 1, 0, 1, 1, 0, 0, 1, 1 /* longe */]), triangles: 2 };
  it('desenha primeiro o que está mais longe', () => {
    const pr = project(two, boundsOf(two), { yaw: 0, pitch: 0, zoom: 1 }, 200, 200);
    expect(Array.from(pr.order)).toEqual([1, 0]);
    for (const v of pr.sx) expect(v).toBeGreaterThan(0);
    for (const s of pr.shade) { expect(s).toBeGreaterThanOrEqual(0.18); expect(s).toBeLessThanOrEqual(1); }
  });
  it('o limite reduz a quantidade de triângulos desenhados', () => {
    const cube = parseObj(CUBE_OBJ);
    expect(project(cube, boundsOf(cube), defaultCamera(), 100, 100).drawn).toBe(12);
    expect(project(cube, boundsOf(cube), defaultCamera(), 100, 100, 4).drawn).toBe(4);
  });
  it('o modelo fica dentro da tela e centralizado', () => {
    const cube = parseObj(CUBE_OBJ);
    const pr = project(cube, boundsOf(cube), defaultCamera(), 400, 300);
    const xs = Array.from(pr.sx), ys = Array.from(pr.sy);
    expect(Math.min(...xs)).toBeGreaterThan(0); expect(Math.max(...xs)).toBeLessThan(400);
    expect(Math.min(...ys)).toBeGreaterThan(0); expect(Math.max(...ys)).toBeLessThan(300);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeGreaterThan(150);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeLessThan(250);
  });
  it('drawMesh pinta todos os triângulos (preenchido) ou só o contorno (aramado)', () => {
    const calls: string[] = [];
    const ctx = new Proxy({}, { get: (_t, name: string) => (name === 'fillStyle' || name === 'strokeStyle' || name === 'lineWidth' || name === 'lineJoin' ? undefined : () => { calls.push(name); }), set: () => true }) as unknown as CanvasRenderingContext2D;
    const cube = parseObj(CUBE_OBJ);
    const n = drawMesh(ctx, cube, boundsOf(cube), defaultCamera(), 100, 100, { wireframe: false, color: [100, 150, 200], background: '#fff' });
    expect(n).toBe(12);
    expect(calls.filter((c) => c === 'fill')).toHaveLength(12);
    calls.length = 0;
    drawMesh(ctx, cube, boundsOf(cube), defaultCamera(), 100, 100, { wireframe: true, color: [100, 150, 200], background: '#fff' });
    expect(calls.filter((c) => c === 'fill')).toHaveLength(0);
    expect(calls.filter((c) => c === 'stroke')).toHaveLength(12);
  });
});
