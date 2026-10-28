import { describe, expect, it } from 'vitest';
import {
  MAX_SIDE, MAX_SCENES, MIN_SIDE, STYLE_PRESETS, VERSOS_SCHEMA, applyStyle, blankScene, blankText, blankVersos, cloneScene, cloneText,
  detectRatio, dimsForRatio, exportFileName, insertAt, moveItem, normColor, normalizeVersos, presetStyle, removeScene,
  rescaleScene, resizeKeepingRatio, rgba, styleOf, usedImageIds
} from './model';

describe('versos · normalização', () => {
  it('projeto vazio ou lixo vira um projeto válido com uma cena', () => {
    for (const raw of [null, undefined, 3, 'x', [], {}, { scenes: 'x' }, { scenes: [] }]) {
      const s = normalizeVersos(raw);
      expect(s.v).toBe(VERSOS_SCHEMA);
      expect(s.scenes).toHaveLength(1);
      expect(s.scenes[0]!.texts).toEqual([]);
    }
  });
  it('limita valores e corrige cores', () => {
    const s = normalizeVersos({
      name: 'P', scenes: [{
        id: 'a', width: 999999, height: 2, background: { mode: 'color', color: '#ABC', alpha: 5 },
        texts: [{ id: 't', text: 'oi', size: -4, opacity: 9, color: 'red', align: 'x', weight: 450, rotation: 700, stroke: { width: -3 } }]
      }]
    });
    const sc = s.scenes[0]!;
    expect(sc.width).toBe(MAX_SIDE);
    expect(sc.height).toBe(MIN_SIDE);
    expect(sc.background.color).toBe('#aabbcc');
    expect(sc.background.alpha).toBe(1);
    const t = sc.texts[0]!;
    expect(t.size).toBe(1);
    expect(t.opacity).toBe(1);
    expect(t.color).toBe('#ffffff');
    expect(t.align).toBe('center');
    expect(t.weight % 100).toBe(0);
    expect(t.rotation).toBe(360);
    expect(t.stroke.width).toBe(0);
  });
  it('ids duplicados ganham novos ids e fundo com imagem sem id volta para cor', () => {
    const s = normalizeVersos({ scenes: [{ id: 'a', background: { mode: 'image' }, texts: [{ id: 't' }, { id: 't' }] }, { id: 'a' }] });
    expect(new Set(s.scenes.map((x) => x.id)).size).toBe(2);
    expect(new Set(s.scenes[0]!.texts.map((x) => x.id)).size).toBe(2);
    expect(s.scenes[0]!.background.mode).toBe('color');
  });
  it('respeita o limite de cenas', () => {
    const s = normalizeVersos({ scenes: Array.from({ length: MAX_SCENES + 20 }, (_, i) => ({ id: 's' + i })) });
    expect(s.scenes).toHaveLength(MAX_SCENES);
  });
  it('preserva a fonte original mesmo quando ela não existe', () => {
    const s = normalizeVersos({ scenes: [{ texts: [{ font: { id: 'minha-fonte-rara', label: 'Minha Fonte Rara' } }] }] });
    expect(s.scenes[0]!.texts[0]!.font).toEqual({ id: 'minha-fonte-rara', label: 'Minha Fonte Rara' });
  });
  it('normalizar duas vezes dá o mesmo resultado', () => {
    const a = normalizeVersos({ scenes: [{ id: 'a', texts: [{ id: 'b', text: 'x' }] }], styles: [{ id: 's', name: 'N', style: { size: 20 } }] });
    expect(normalizeVersos(JSON.parse(JSON.stringify(a)))).toEqual(a);
  });
});

describe('versos · proporções', () => {
  it('detecta proporções predefinidas', () => {
    expect(detectRatio(1080, 1080)).toBe('1:1');
    expect(detectRatio(1920, 1080)).toBe('16:9');
    expect(detectRatio(1080, 1920)).toBe('9:16');
    expect(detectRatio(1080, 1350)).toBe('4:5');
    expect(detectRatio(1600, 1200)).toBe('4:3');
    expect(detectRatio(1000, 777)).toBe('custom');
  });
  it('troca de proporção mantém o lado maior', () => {
    expect(dimsForRatio('16:9', 1080, 1080)).toEqual({ width: 1080, height: 608 });
    expect(dimsForRatio('9:16', 1080, 1080)).toEqual({ width: 608, height: 1080 });
    expect(dimsForRatio('custom', 500, 300)).toEqual({ width: 500, height: 300 });
  });
  it('largura/altura seguem a proporção, e em custom são independentes', () => {
    const s = { width: 1920, height: 1080, ratio: '16:9' as const };
    expect(resizeKeepingRatio(s, 'width', 1280)).toEqual({ width: 1280, height: 720 });
    expect(resizeKeepingRatio(s, 'height', 540)).toEqual({ width: 960, height: 540 });
    expect(resizeKeepingRatio({ ...s, ratio: 'custom' }, 'width', 1000)).toEqual({ width: 1000, height: 1080 });
  });
});

describe('versos · cenas', () => {
  it('duplicar gera ids novos e preserva tudo o mais', () => {
    const sc = blankScene(1920, 1080);
    sc.name = 'Verso 1';
    sc.background = { mode: 'image', color: '#112233', alpha: 0.5, image: { imageId: 'im1', fit: 'contain', x: 3, y: -4, zoom: 1.5 } };
    const t = blankText(sc, 'Olá'); t.size = 77; t.stroke.width = 3; sc.texts.push(t, blankText(sc, 'Dois'));
    const copy = cloneScene(sc, ' (cópia)');
    expect(copy.id).not.toBe(sc.id);
    expect(copy.texts.map((x) => x.id)).not.toContain(sc.texts[0]!.id);
    expect(copy.name).toBe('Verso 1 (cópia)');
    expect(copy.texts[0]!.size).toBe(77);
    expect(copy.background).toEqual(sc.background);
    copy.texts[0]!.text = 'mudou';
    expect(sc.texts[0]!.text).toBe('Olá');
    expect(copy.width).toBe(1920);
  });
  it('mover cenas com botões', () => {
    const a = blankScene(), b = blankScene(), c = blankScene();
    const list = [a, b, c];
    expect(moveItem(list, a.id, -1)).toBe(false);
    expect(moveItem(list, a.id, 1)).toBe(true);
    expect(list.map((x) => x.id)).toEqual([b.id, a.id, c.id]);
    expect(moveItem(list, c.id, 1)).toBe(false);
  });
  it('colar insere uma cena nova na posição escolhida', () => {
    const a = blankScene(), b = blankScene();
    const list = [a, b];
    insertAt(list, cloneScene(a), 1);
    expect(list).toHaveLength(3);
    expect(list[0]).toBe(a);
    expect(list[2]).toBe(b);
  });
  it('excluir a última cena deixa uma cena inicial vazia com o mesmo tamanho', () => {
    const state = blankVersos('P', 1080, 1920);
    state.scenes[0]!.texts.push(blankText(state.scenes[0]!));
    const oldId = state.scenes[0]!.id;
    const next = removeScene(state, oldId);
    expect(state.scenes).toHaveLength(1);
    expect(state.scenes[0]!.id).toBe(next);
    expect(next).not.toBe(oldId);
    expect(state.scenes[0]!.texts).toEqual([]);
    expect(state.scenes[0]!.height).toBe(1920);
  });
  it('excluir uma cena seleciona a vizinha', () => {
    const state = blankVersos();
    state.scenes.push(blankScene(), blankScene());
    const ids = state.scenes.map((s) => s.id);
    expect(removeScene(state, ids[1]!)).toBe(ids[2]);
    expect(removeScene(state, ids[2]!)).toBe(ids[0]);
  });
  it('redimensionar com conteúdo escala textos; sem conteúdo só muda o tamanho', () => {
    const sc = blankScene(1000, 1000);
    const t = blankText(sc); t.x = 500; t.y = 250; t.size = 100; t.stroke.width = 10; sc.texts.push(t);
    const keep = JSON.parse(JSON.stringify(sc)) as typeof sc;
    rescaleScene(sc, 2000, 2000, true);
    expect(sc.texts[0]).toMatchObject({ x: 1000, y: 500, size: 200 });
    expect(sc.texts[0]!.stroke.width).toBe(20);
    rescaleScene(keep, 2000, 1000, false);
    expect(keep.texts[0]!.x).toBe(500);
    expect(keep.ratio).toBe('custom');
  });
  it('imagens usadas', () => {
    const state = blankVersos();
    state.scenes[0]!.background = { mode: 'image', color: '#000000', alpha: 1, image: { imageId: 'a', fit: 'cover', x: 0, y: 0, zoom: 1 } };
    state.scenes.push(blankScene());
    expect([...usedImageIds(state)]).toEqual(['a']);
  });
});

describe('versos · textos e estilos', () => {
  it('aplicar estilo não toca conteúdo, posição, largura nem rotação', () => {
    const sc = blankScene();
    const a = blankText(sc, 'A'); a.size = 200; a.color = '#ff0000'; a.italic = true; a.shadow.blur = 9;
    const b = blankText(sc, 'B'); b.x = 12; b.rotation = 30; b.width = 321;
    applyStyle(b, styleOf(a));
    expect(b).toMatchObject({ text: 'B', x: 12, rotation: 30, width: 321, size: 200, color: '#ff0000', italic: true });
    expect(b.shadow.blur).toBe(9);
    b.shadow.blur = 1;
    expect(a.shadow.blur).toBe(9);
  });
  it('duplicar texto desloca e gera id', () => {
    const sc = blankScene(); const a = blankText(sc);
    const c = cloneText(a, 20);
    expect(c.id).not.toBe(a.id);
    expect(c.x).toBe(a.x + 20);
  });
  it('presets geram estilos válidos e proporcionais à altura', () => {
    for (const p of STYLE_PRESETS) {
      const st = presetStyle(p, 1000);
      expect(st.font.id).toBe(p.style.font.id);
      expect(st.size).toBeGreaterThan(0);
    }
    expect(presetStyle(STYLE_PRESETS[0]!, 2000).size).toBe(2 * presetStyle(STYLE_PRESETS[0]!, 1000).size);
  });
});

describe('versos · cores e nomes de arquivo', () => {
  it('cores', () => {
    expect(normColor('#FFF', '#000000')).toBe('#ffffff');
    expect(normColor('azul', '#123456')).toBe('#123456');
    expect(rgba('#ff0000', 0.5)).toBe('rgba(255,0,0,0.5)');
  });
  it('nomes de exportação previsíveis e ordenáveis', () => {
    expect(exportFileName('Meu projeto', 0, 5, 'full')).toBe('Meu projeto-001.png');
    expect(exportFileName('Meu/projeto:', 11, 120, 'text')).toBe('Meu-projeto-012-texto.png');
    expect(exportFileName('   ', 0, 1, 'full')).toBe('versos-001.png');
    expect(exportFileName('x', 999, 1000, 'full')).toBe('x-1000.png');
  });
});
