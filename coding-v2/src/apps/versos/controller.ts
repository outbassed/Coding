/**
 * Controlador do editor Versos: seleção, operações de cena/texto/fundo/tamanho, copiar/colar, exportação e atalhos.
 * Toda mutação passa pelo `state` do documento (por isso desfazer/refazer e salvamento automático funcionam sozinhos);
 * a seleção fica fora do documento. As regras de negócio (ids novos, limites, nomes) vivem em model.ts e clipboard.ts.
 */
import { computed, markRaw, onBeforeUnmount, onMounted, reactive, ref, watch, type Ref, type UnwrapNestedRefs } from 'vue';
import type { LegacyImage } from '../../storage/documents';
import { downloadBlob } from '../../shared/files/download';
import { checkImport, loadImportLimits } from '../../workspace/importLimits';
import {
  MAX_SCENES, MAX_SIDE, MAX_TEXTS, MIN_SIDE, PIXEL_WARNING, RATIOS, STYLE_PRESETS, applyStyle, blankScene, blankText, cloneScene, cloneText,
  dimsForRatio, insertAt, isRatioId, moveItem, newId, pixelCount, presetStyle, projectBaseName, ratioDef, removeScene, rescaleScene, resizeKeepingRatio,
  sceneLabel, styleOf, type Background, type ExportKind, type RatioId, type SavedStyle, type Scene, type TextBlock, type TextStyle, type VersosState
} from './model';
import {
  copyFormat, copyScenes, copyTexts, peekClip, planScenePaste, planTextPaste, readClip, remapImages, type ClipKind, type SceneClip, type TextClip
} from './clipboard';
import { ExportCancelled, ExportError, exportScenes, zipFiles, type ExportProgress, type ExportedFile } from './export';
import { onFontsChange, preloadFonts } from './fonts';
import { ImageCache, readImageFile } from './imageStore';
import { canvasProblem, defaultMakeCanvas, type RenderDeps } from './render';

/** O que o controlador precisa do documento (o `useDocument` do Coding entrega isso). */
export interface DocLike {
  state: Ref<VersosState>;
  images: Ref<LegacyImage[]>;
  setChangeKey(key: string): void;
  say(text: string): void;
}
export type FocusArea = 'scenes' | 'stage';
export type ExportScope = 'current' | 'all' | 'range';
export type ExportAs = 'png' | 'zip';
export interface ExportRequest { kind: ExportKind; scope: ExportScope; as: ExportAs; from?: number; to?: number }
export interface VersosAction { command: string; sceneId?: string; textId?: string }
export const ACTION_EVENT = 'coding:versos-action';

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.tagName === 'INPUT') return !['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset', 'image'].includes((el as HTMLInputElement).type);
  return el.isContentEditable === true;
}
const imageName = (name: string): string => name.replace(/\.[^.]+$/, '').slice(0, 80);

export function useVersos(doc: DocLike) {
  const state = doc.state;
  const sceneId = ref<string>(state.value.scenes[0]!.id);
  const textId = ref<string | null>(null);
  const area = ref<FocusArea>('stage');
  const message = ref('');
  const imageTick = ref(0);
  const fontTick = ref(0);
  const clipKind = ref<ClipKind | null>(peekClip());

  // ---------- seleção ----------
  const sceneIndex = computed(() => Math.max(0, state.value.scenes.findIndex((s) => s.id === sceneId.value)));
  const scene = computed<Scene>(() => state.value.scenes[sceneIndex.value]!);
  const selectedText = computed<TextBlock | null>(() => scene.value.texts.find((t) => t.id === textId.value) ?? null);
  const sceneCount = computed(() => state.value.scenes.length);

  watch(() => state.value.scenes.map((s) => s.id).join(','), () => {
    const list = state.value.scenes;
    if (!list.some((s) => s.id === sceneId.value)) sceneId.value = list[0]!.id; // ex.: desfazer removeu a cena selecionada, ou o projeto salvo abriu
  });
  watch(() => scene.value.texts.map((t) => t.id).join(','), () => {
    if (textId.value && !scene.value.texts.some((t) => t.id === textId.value)) textId.value = null;
  });
  watch(sceneId, () => { textId.value = null; });

  function note(text: string): void { message.value = text; doc.say(text); }
  function selectScene(id: string): void { if (state.value.scenes.some((s) => s.id === id)) sceneId.value = id; }
  function selectText(id: string | null): void { textId.value = id && scene.value.texts.some((t) => t.id === id) ? id : null; }
  function gotoScene(delta: number): void {
    const list = state.value.scenes;
    const i = Math.min(list.length - 1, Math.max(0, sceneIndex.value + delta));
    sceneId.value = list[i]!.id;
  }
  const labelOf = (s: Scene): string => sceneLabel(s, state.value.scenes.indexOf(s));
  const textLabel = (t: TextBlock, i: number): string => t.name.trim() || (t.text.trim().split('\n')[0] ?? '').slice(0, 28) || 'Texto ' + (i + 1);

  // ---------- imagens e fontes ----------
  const blobs = computed(() => { const m = new Map<string, Blob>(); for (const i of doc.images.value) if (i.blob) m.set(i.id, i.blob); return m; });
  const cache = markRaw(new ImageCache((id) => blobs.value.get(id), () => { imageTick.value++; }));
  watch(doc.images, () => { imageTick.value++; });
  const deps: RenderDeps = { getImage: (id) => cache.get(id), makeCanvas: defaultMakeCanvas };
  onFontsChange(() => { fontTick.value++; });
  watch(() => JSON.stringify(state.value.scenes.map((s) => s.texts.map((t) => t.font))), () => {
    preloadFonts(state.value.scenes.flatMap((s) => s.texts.map((t) => t.font)));
  }, { immediate: true });
  onBeforeUnmount(() => cache.dispose());

  function addImageRecord(blob: Blob, name: string): string {
    const id = 'img-' + newId('').slice(0, 12) + Date.now().toString(36);
    const record: LegacyImage = { id, docId: '', blob, mime: blob.type, name: name.slice(0, 120) };
    doc.images.value = [...doc.images.value, record];
    return id;
  }

  // ---------- cenas ----------
  function canAddScene(): boolean {
    if (state.value.scenes.length >= MAX_SCENES) { note('Limite de ' + MAX_SCENES + ' cenas por projeto.'); return false; }
    return true;
  }
  function addScene(): void {
    if (!canAddScene()) return;
    const cur = scene.value;
    const fresh = blankScene(cur.width, cur.height, cur.ratio);
    fresh.background = JSON.parse(JSON.stringify(cur.background)) as Background; // mantém o mesmo fundo para continuar a sequência
    insertAt(state.value.scenes, fresh, sceneIndex.value + 1);
    sceneId.value = fresh.id;
    note('Cena ' + (sceneIndex.value + 1) + ' criada.');
  }
  function duplicateScene(id: string = sceneId.value): void {
    const i = state.value.scenes.findIndex((s) => s.id === id);
    if (i < 0 || !canAddScene()) return;
    const copy = cloneScene(state.value.scenes[i]!, ' (cópia)');
    insertAt(state.value.scenes, copy, i + 1);
    sceneId.value = copy.id;
    note('Cena duplicada.');
  }
  function deleteScene(id: string = sceneId.value): void {
    const wasLast = state.value.scenes.length === 1;
    const wasCurrent = id === sceneId.value;
    const next = removeScene(state.value, id);
    if (wasCurrent) sceneId.value = next;
    note(wasLast ? 'Última cena excluída: o projeto ficou com uma cena vazia. Use Desfazer para recuperar.' : 'Cena excluída. Use Desfazer para recuperar.');
  }
  function moveScene(id: string, delta: -1 | 1): void {
    if (moveItem(state.value.scenes, id, delta)) note('Cena movida para a posição ' + (state.value.scenes.findIndex((s) => s.id === id) + 1) + '.');
  }
  async function copySceneCmd(id: string = sceneId.value): Promise<boolean> {
    const s = state.value.scenes.find((x) => x.id === id);
    if (!s) return false;
    const r = await copyScenes([s], (imageId) => blobs.value.get(imageId));
    clipKind.value = 'scenes';
    note(r.omitted ? 'Cena copiada. O fundo em imagem é grande e só poderá ser colado neste projeto e enquanto esta página estiver aberta.' : 'Cena copiada. Cole com Ctrl+V para criar uma nova cena.');
    return true;
  }
  async function cutScene(id: string = sceneId.value): Promise<void> {
    if (await copySceneCmd(id)) { deleteScene(id); note('Cena recortada. Cole com Ctrl+V para criar uma nova cena.'); }
  }
  /** Colar SEMPRE cria cena(s) nova(s) logo depois da selecionada; nunca substitui a atual. */
  function pasteScenes(): boolean {
    const payload = readClip();
    if (!payload || payload.clip.kind !== 'scenes') return false;
    const clip: SceneClip = payload.clip;
    if (state.value.scenes.length + clip.scenes.length > MAX_SCENES) { note('Limite de ' + MAX_SCENES + ' cenas por projeto.'); return true; }
    const existing = new Set(doc.images.value.map((i) => i.id));
    const plan = planScenePaste(clip, payload.blobs, (id) => existing.has(id));
    const map = new Map<string, string>();
    for (const add of plan.imagesToAdd) map.set(add.oldId, addImageRecord(add.blob, 'Fundo colado'));
    remapImages(plan.scenes, map);
    let at = sceneIndex.value + 1;
    for (const s of plan.scenes) insertAt(state.value.scenes, s, at++);
    sceneId.value = plan.scenes[0]!.id;
    note(plan.droppedBackgrounds
      ? 'Cena colada sem o fundo em imagem (o arquivo não estava disponível). Os textos e o resto vieram inteiros.'
      : plan.scenes.length > 1 ? plan.scenes.length + ' cenas coladas.' : 'Cena colada como nova cena.');
    return true;
  }
  function renameScene(name: string): void { scene.value.name = name.slice(0, 80); }

  // ---------- textos ----------
  function addText(text = 'Novo texto'): void {
    if (scene.value.texts.length >= MAX_TEXTS) { note('Limite de ' + MAX_TEXTS + ' textos por cena.'); return; }
    const t = blankText(scene.value, text);
    // um texto novo herda a aparência do último, para a cena ficar coerente
    const last = scene.value.texts[scene.value.texts.length - 1];
    if (last) { applyStyle(t, styleOf(last)); t.y = Math.min(scene.value.height - 20, last.y + Math.round(last.size * last.lineHeight * 1.6)); }
    scene.value.texts.push(t);
    textId.value = t.id;
    note('Texto adicionado.');
  }
  function duplicateText(id: string | null = textId.value): void {
    const i = scene.value.texts.findIndex((t) => t.id === id);
    if (i < 0 || scene.value.texts.length >= MAX_TEXTS) return;
    const copy = cloneText(scene.value.texts[i]!, 24);
    scene.value.texts.splice(i + 1, 0, copy);
    textId.value = copy.id;
    note('Texto duplicado.');
  }
  function deleteText(id: string | null = textId.value): void {
    const i = scene.value.texts.findIndex((t) => t.id === id);
    if (i < 0) return;
    scene.value.texts.splice(i, 1);
    textId.value = scene.value.texts[Math.min(i, scene.value.texts.length - 1)]?.id ?? null;
    note('Texto excluído. Use Desfazer para recuperar.');
  }
  /** `delta` +1 sobe uma camada (desenhado por cima), −1 desce. */
  function moveText(id: string | null, delta: -1 | 1): void {
    if (id && moveItem(scene.value.texts, id, delta)) note('Ordem das camadas alterada.');
  }
  function toggleText(id: string | null = textId.value): void {
    const t = scene.value.texts.find((x) => x.id === id);
    if (t) { t.visible = !t.visible; note(t.visible ? 'Texto visível.' : 'Texto oculto (não aparece na prévia nem na exportação).'); }
  }
  function copyTextCmd(id: string | null = textId.value): boolean {
    const t = scene.value.texts.find((x) => x.id === id);
    if (!t) return false;
    copyTexts([t]); clipKind.value = 'texts';
    note('Texto copiado. Cole com Ctrl+V.');
    return true;
  }
  function cutText(id: string | null = textId.value): void { if (copyTextCmd(id)) { deleteText(id); note('Texto recortado.'); } }
  function pasteTexts(): boolean {
    const payload = readClip();
    if (!payload || payload.clip.kind !== 'texts') return false;
    const room = MAX_TEXTS - scene.value.texts.length;
    if (room <= 0) { note('Limite de ' + MAX_TEXTS + ' textos por cena.'); return true; }
    const pasted = planTextPaste(payload.clip as TextClip, 24).slice(0, room);
    scene.value.texts.push(...pasted);
    textId.value = pasted[pasted.length - 1]!.id;
    note(pasted.length > 1 ? pasted.length + ' textos colados.' : 'Texto colado.');
    return true;
  }
  function copyFormatCmd(id: string | null = textId.value): boolean {
    const t = scene.value.texts.find((x) => x.id === id);
    if (!t) { note('Selecione um texto para copiar a formatação.'); return false; }
    copyFormat(styleOf(t)); clipKind.value = 'format';
    note('Formatação copiada. Selecione outro texto e use Colar formatação.');
    return true;
  }
  function pasteFormatCmd(id: string | null = textId.value): boolean {
    const payload = readClip();
    if (!payload || payload.clip.kind !== 'format') return false;
    const t = scene.value.texts.find((x) => x.id === id);
    if (!t) { note('Selecione um texto para colar a formatação.'); return true; }
    applyStyle(t, payload.clip.style);
    note('Formatação colada (o conteúdo do texto não mudou).');
    return true;
  }

  // ---------- estilos ----------
  function applyPreset(presetId: string): void {
    const preset = STYLE_PRESETS.find((p) => p.id === presetId);
    const t = selectedText.value;
    if (!preset || !t) { note('Selecione um texto para aplicar o estilo.'); return; }
    applyStyle(t, presetStyle(preset, scene.value.height));
    note('Estilo “' + preset.name + '” aplicado.');
  }
  function saveStyle(name: string): void {
    const t = selectedText.value;
    if (!t) { note('Selecione um texto para guardar o estilo.'); return; }
    if (state.value.styles.length >= 100) { note('Limite de 100 estilos salvos.'); return; }
    const saved: SavedStyle = { id: newId('st_'), name: name.trim().slice(0, 60) || 'Estilo ' + (state.value.styles.length + 1), style: styleOf(t) };
    state.value.styles.push(saved);
    note('Estilo “' + saved.name + '” salvo neste projeto.');
  }
  function applySaved(styleId: string, toAll = false): void {
    const saved = state.value.styles.find((s) => s.id === styleId);
    if (!saved) return;
    const targets = toAll ? scene.value.texts : selectedText.value ? [selectedText.value] : [];
    if (!targets.length) { note('Selecione um texto para aplicar o estilo.'); return; }
    for (const t of targets) applyStyle(t, saved.style);
    note('Estilo “' + saved.name + '” aplicado' + (targets.length > 1 ? ' a ' + targets.length + ' textos.' : '.'));
  }
  function deleteSaved(styleId: string): void {
    const i = state.value.styles.findIndex((s) => s.id === styleId);
    if (i >= 0) { state.value.styles.splice(i, 1); note('Estilo removido da lista (os textos que o usam não mudam).'); }
  }
  /** Usa a aparência de um texto de OUTRA cena (ou desta) sem trocar o conteúdo de quem recebe. */
  function applyStyleFrom(fromSceneId: string, fromTextId: string, toAll = false): void {
    const from = state.value.scenes.find((s) => s.id === fromSceneId)?.texts.find((t) => t.id === fromTextId);
    if (!from) return;
    const targets = toAll ? scene.value.texts : selectedText.value ? [selectedText.value] : [];
    if (!targets.length) { note('Selecione um texto para receber o estilo.'); return; }
    const style = styleOf(from);
    for (const t of targets) if (t !== from) applyStyle(t, style);
    note('Aparência aplicada' + (targets.length > 1 ? ' a ' + targets.length + ' textos' : '') + ' sem alterar o conteúdo.');
  }
  function applyStyleToText(target: TextBlock, style: TextStyle): void { applyStyle(target, style); }

  // ---------- fundo ----------
  function setBackgroundMode(mode: Background['mode']): void {
    const bg = scene.value.background;
    if (mode === 'image' && !bg.image) { note('Importe uma imagem para usar como fundo.'); return; }
    bg.mode = mode;
    if (mode === 'transparent') note('Fundo transparente: a grade que aparece na prévia não é exportada.');
  }
  async function importBackground(file: File): Promise<boolean> {
    if (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name)) { note('“' + file.name + '” não é uma imagem que o navegador abra.'); return false; }
    if (file.type === 'image/svg+xml') { note('SVG não é aceito como fundo. Exporte como PNG, JPG ou WebP.'); return false; }
    const check = checkImport('image', file.size, loadImportLimits());
    if (check.level === 'block') { note(check.message); return false; }
    let info;
    try { info = await readImageFile(file); } catch (e) { note(e instanceof Error ? e.message : 'Não foi possível ler esta imagem.'); return false; }
    if (info.width * info.height > 120_000_000) { note('A imagem é grande demais (mais de 120 megapixels).'); return false; }
    const id = addImageRecord(file, file.name);
    const bg = scene.value.background;
    bg.image = { imageId: id, fit: 'cover', x: 0, y: 0, zoom: 1 };
    bg.mode = 'image';
    note((check.level === 'warn' ? check.message + ' ' : '') + 'Fundo “' + file.name + '” aplicado a esta cena. Os textos continuam como estavam.');
    return true;
  }
  function removeBackgroundImage(): void {
    const bg = scene.value.background;
    bg.image = null;
    if (bg.mode === 'image') bg.mode = 'color';
    note('Imagem de fundo removida. Os textos continuam como estavam.');
  }
  function resetFraming(): void {
    const img = scene.value.background.image;
    if (img) { img.x = 0; img.y = 0; img.zoom = 1; }
  }

  // ---------- tamanho e proporção ----------
  const scaleContent = ref(true);
  const sizeError = ref('');
  /** Devolve a mensagem de erro (ou null) para um tamanho. Só impede o que é inválido ou tecnicamente impossível. */
  function sizeProblem(width: number, height: number): string | null {
    if (!Number.isFinite(width) || !Number.isFinite(height)) return 'Informe números para largura e altura.';
    if (!Number.isInteger(width) || !Number.isInteger(height)) return 'Use números inteiros de pixels.';
    if (width < MIN_SIDE || height < MIN_SIDE) return 'O mínimo é ' + MIN_SIDE + ' px de largura e de altura.';
    if (width > MAX_SIDE || height > MAX_SIDE) return 'O máximo é ' + MAX_SIDE + ' px por lado.';
    return canvasProblem(width, height);
  }
  function sizeWarning(s: Pick<Scene, 'width' | 'height'>): string {
    return pixelCount(s) > PIXEL_WARNING ? 'Imagem com mais de 16 megapixels: a exportação pode falhar em celulares ou aparelhos com pouca memória.' : '';
  }
  function applySize(width: number, height: number): boolean {
    const w = Math.round(width), h = Math.round(height);
    const problem = sizeProblem(w, h);
    if (problem) { sizeError.value = problem; return false; }
    sizeError.value = '';
    if (w === scene.value.width && h === scene.value.height) return true;
    doc.setChangeKey('size-' + scene.value.id);
    rescaleScene(scene.value, w, h, scaleContent.value);
    note('Tamanho da cena: ' + w + ' × ' + h + ' px. As outras cenas não mudaram.');
    return true;
  }
  function setRatio(id: RatioId): void {
    if (!isRatioId(id)) return;
    const cur = scene.value;
    if (id === 'custom') { cur.ratio = 'custom'; return; }
    const d = dimsForRatio(id, cur.width, cur.height);
    if (applySize(d.width, d.height)) cur.ratio = id;
  }
  function setSide(side: 'width' | 'height', value: number): boolean {
    if (!Number.isFinite(value)) { sizeError.value = 'Informe um número de pixels.'; return false; }
    const next = resizeKeepingRatio(scene.value, side, value);
    const problem = sizeProblem(next.width, next.height);
    if (problem) {
      sizeError.value = scene.value.ratio !== 'custom' && !(Math.round(value) < MIN_SIDE || Math.round(value) > MAX_SIDE)
        ? 'Na proporção ' + scene.value.ratio + ' isso daria ' + next.width + ' × ' + next.height + ' px. ' + problem + ' Escolha “Personalizada” para valores livres.'
        : problem;
      return false;
    }
    return applySize(next.width, next.height);
  }
  const ratioOptions = RATIOS;
  const ratioHint = (id: RatioId): string => (id === 'custom' ? 'Largura e altura livres' : ratioDef(id).w + ':' + ratioDef(id).h);

  // ---------- exportação ----------
  const progress = ref<ExportProgress | null>(null);
  const exportMessage = ref('');
  const exportError = ref('');
  let abort: AbortController | null = null;
  const exporting = computed(() => progress.value !== null);

  function rangeOf(req: ExportRequest): { scenes: Scene[]; indexes: number[] } {
    const all = state.value.scenes;
    if (req.scope === 'current') return { scenes: [scene.value], indexes: [sceneIndex.value] };
    let from = 0, to = all.length - 1;
    if (req.scope === 'range') {
      from = Math.min(all.length, Math.max(1, Math.round(req.from ?? 1))) - 1;
      to = Math.min(all.length, Math.max(1, Math.round(req.to ?? all.length))) - 1;
      if (from > to) [from, to] = [to, from];
    }
    const indexes: number[] = [];
    for (let i = from; i <= to; i++) indexes.push(i);
    return { scenes: indexes.map((i) => all[i]!), indexes };
  }
  async function runExport(req: ExportRequest): Promise<boolean> {
    if (exporting.value) return false;
    exportError.value = ''; exportMessage.value = '';
    const { scenes, indexes } = rangeOf(req);
    const project = state.value.name;
    abort = new AbortController();
    progress.value = { done: 0, total: scenes.length, current: '' };
    try {
      const result = await exportScenes(project, scenes, indexes, state.value.scenes.length, {
        kind: req.kind,
        signal: abort.signal,
        onProgress: (p) => { progress.value = p; },
        loadImage: async (id) => cache.loadFull(id)
      });
      let summary: string;
      if (req.as === 'zip' && result.files.length > 1) {
        progress.value = { done: scenes.length, total: scenes.length, current: 'Montando o ZIP…' };
        const zip = await zipFiles(result.files);
        const name = projectBaseName(project) + (req.kind === 'text' ? '-textos' : '') + '.zip';
        downloadBlob(zip, name);
        summary = result.files.length + ' imagens salvas em ' + name + '.';
      } else if (result.files.length === 1) {
        const f = result.files[0]!;
        downloadBlob(f.blob, f.name);
        summary = f.name + ' (' + f.width + ' × ' + f.height + ' px) enviado para download.';
      } else {
        await downloadMany(result.files);
        summary = result.files.length + ' PNGs enviados para download, um por cena (o navegador pode pedir permissão para vários downloads).';
      }
      const extras: string[] = [];
      if (result.missingFonts.length) extras.push('Fonte indisponível neste aparelho, usada a substituta Arimo: ' + result.missingFonts.join(', ') + '.');
      if (result.missingImages.length) extras.push('Algum fundo em imagem não pôde ser lido e saiu sem a imagem.');
      exportMessage.value = [summary, ...extras].join(' ');
      note(exportMessage.value);
      return true;
    } catch (e) {
      if (e instanceof ExportCancelled) { exportMessage.value = 'Exportação cancelada. Nada foi baixado.'; note(exportMessage.value); }
      else { exportError.value = e instanceof ExportError ? e.message : 'Não foi possível exportar: ' + (e instanceof Error ? e.message : 'erro desconhecido') + '.'; note(exportError.value); }
      return false;
    } finally { progress.value = null; abort = null; }
  }
  async function downloadMany(files: readonly ExportedFile[]): Promise<void> {
    for (const f of files) {
      if (abort?.signal.aborted) throw new ExportCancelled();
      downloadBlob(f.blob, f.name);
      await new Promise<void>((resolve) => setTimeout(resolve, 350));
    }
  }
  function cancelExport(): void { abort?.abort(); }

  // ---------- teclado e menu de contexto ----------
  function targetsText(): boolean { return area.value === 'stage' && selectedText.value !== null; }
  function onKeydown(e: KeyboardEvent): void {
    if (e.defaultPrevented || isTypingTarget(e.target)) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest('dialog,[role="dialog"],.coding-context-menu')) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && !e.altKey) {
      if (key === 'c' && !e.shiftKey) { e.preventDefault(); if (targetsText()) copyTextCmd(); else void copySceneCmd(); return; }
      if (key === 'x' && !e.shiftKey) { e.preventDefault(); if (targetsText()) cutText(); else void cutScene(); return; }
      if (key === 'd' && !e.shiftKey) { e.preventDefault(); if (targetsText()) duplicateText(); else duplicateScene(); return; }
      if (key === 'v' && !e.shiftKey) {
        const kind = peekClip();
        if (!kind) return; // nada copiado internamente: deixa o comportamento nativo
        e.preventDefault();
        if (kind === 'scenes') pasteScenes(); else if (kind === 'texts') pasteTexts(); else pasteFormatCmd();
        return;
      }
      return;
    }
    if (e.altKey || e.shiftKey && key !== 'delete') return;
    if (key === 'delete') {
      if (targetsText()) { e.preventDefault(); deleteText(); }
      else if (area.value === 'scenes') { e.preventDefault(); deleteScene(); }
    } else if (key === 'pageup') { e.preventDefault(); gotoScene(-1); }
    else if (key === 'pagedown') { e.preventDefault(); gotoScene(1); }
  }
  /** Qual região está em uso: a lista de cenas ou o resto (Safari não foca botões ao clicar, por isso também ouvimos o ponteiro). */
  function onFocusIn(e: Event): void {
    const el = e.target as HTMLElement | null;
    area.value = el?.closest?.('[data-area="scenes"]') ? 'scenes' : 'stage';
  }
  function nudge(dx: number, dy: number): void {
    const t = selectedText.value;
    if (!t) return;
    doc.setChangeKey('nudge-' + t.id);
    t.x = Math.round(t.x + dx); t.y = Math.round(t.y + dy);
  }
  function onAction(e: Event): void {
    const a = (e as CustomEvent<VersosAction>).detail;
    if (!a) return;
    if (a.sceneId) selectScene(a.sceneId);
    if (a.textId) selectText(a.textId);
    switch (a.command) {
      case 'scene-new': addScene(); break;
      case 'scene-duplicate': duplicateScene(); break;
      case 'scene-copy': void copySceneCmd(); break;
      case 'scene-cut': void cutScene(); break;
      case 'scene-paste': if (!pasteScenes()) note('Nenhuma cena copiada.'); break;
      case 'scene-up': moveScene(sceneId.value, -1); break;
      case 'scene-down': moveScene(sceneId.value, 1); break;
      case 'scene-delete': deleteScene(); break;
      case 'text-duplicate': duplicateText(); break;
      case 'text-copy': copyTextCmd(); break;
      case 'text-cut': cutText(); break;
      case 'text-paste': if (!pasteTexts()) note('Nenhum texto copiado.'); break;
      case 'text-copy-format': copyFormatCmd(); break;
      case 'text-paste-format': if (!pasteFormatCmd()) note('Nenhuma formatação copiada.'); break;
      case 'text-up': moveText(textId.value, 1); break;
      case 'text-down': moveText(textId.value, -1); break;
      case 'text-toggle': toggleText(); break;
      case 'text-delete': deleteText(); break;
    }
  }
  const syncClip = (): void => { clipKind.value = peekClip(); };
  onMounted(() => {
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('focusin', onFocusIn);
    window.addEventListener('pointerdown', onFocusIn, true);
    window.addEventListener(ACTION_EVENT, onAction);
    window.addEventListener('storage', syncClip);
  });
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown);
    window.removeEventListener('focusin', onFocusIn);
    window.removeEventListener('pointerdown', onFocusIn, true);
    window.removeEventListener(ACTION_EVENT, onAction);
    window.removeEventListener('storage', syncClip);
    abort?.abort();
  });

  return {
    state, doc, scene, sceneIndex, sceneCount, sceneId, textId, selectedText, area, message, imageTick, fontTick, clipKind, cache, deps,
    note, selectScene, selectText, gotoScene, labelOf, textLabel,
    addScene, duplicateScene, deleteScene, moveScene, copySceneCmd, cutScene, pasteScenes, renameScene,
    addText, duplicateText, deleteText, moveText, toggleText, copyTextCmd, cutText, pasteTexts, copyFormatCmd, pasteFormatCmd, nudge,
    applyPreset, saveStyle, applySaved, deleteSaved, applyStyleFrom, applyStyleToText,
    setBackgroundMode, importBackground, removeBackgroundImage, resetFraming,
    scaleContent, sizeError, sizeProblem, sizeWarning, applySize, setRatio, setSide, ratioOptions, ratioHint,
    progress, exporting, exportMessage, exportError, runExport, cancelExport
  };
}
export type VersosController = ReturnType<typeof useVersos>;
/** O controlador envolvido em `reactive`: nos componentes os refs já chegam "abertos" (v.scene, v.progress…). */
export type VersosView = UnwrapNestedRefs<VersosController>;
export function createVersos(doc: DocLike): VersosView { return reactive(useVersos(doc)); }
