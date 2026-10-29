<script setup lang="ts">
import { ref } from 'vue';
import {
  DEFAULT_IMPORT_LIMITS, KIND_LABEL, MAX_LIMIT_MB, MIN_LIMIT_MB, loadImportLimits, normalizeImportLimits, resetImportLimits, saveImportLimits,
  type ImportKind, type ImportLimits
} from '../../workspace/importLimits';

const emit = defineEmits<{ announce: [text: string] }>();
const limits = ref<ImportLimits>(loadImportLimits());
const error = ref('');
const rows: { kind: ImportKind; title: string; help: string }[] = [
  { kind: 'audio', title: 'Música de referência (áudio)', help: 'MP3, WAV, OGG, M4A e outros que o navegador toque.' },
  { kind: 'video', title: 'Vídeo de referência (só o áudio toca)', help: 'MP4, WebM e outros. O vídeo nunca é mostrado nem carregado inteiro na memória.' },
  { kind: 'image', title: 'Imagem de fundo', help: 'PNG, JPG, WebP e outros. É guardada no projeto como foi importada.' }
];

function persist(next: ImportLimits, message: string): void {
  const clean = normalizeImportLimits(next);
  if (!saveImportLimits(clean)) { error.value = 'Este navegador não permitiu guardar o ajuste. Nada foi alterado.'; return; }
  limits.value = clean; error.value = '';
  emit('announce', message);
}
function toggle(on: boolean): void {
  persist({ ...limits.value, enabled: on }, on ? 'Limites de tamanho ligados.' : 'Limites de tamanho desligados.');
}
function setValue(kind: ImportKind, field: 'warn' | 'max', raw: string): void {
  const n = Number(raw.replace(',', '.'));
  if (!Number.isFinite(n) || n < MIN_LIMIT_MB || n > MAX_LIMIT_MB) { error.value = 'Use um valor entre ' + MIN_LIMIT_MB + ' e ' + MAX_LIMIT_MB + ' MB.'; limits.value = { ...limits.value }; return; }
  const rule = { ...limits.value[kind], [field]: n };
  if (field === 'max' && rule.warn > n) rule.warn = n;
  persist({ ...limits.value, [kind]: rule }, 'Limite de ' + KIND_LABEL[kind] + ' atualizado.');
}
function restore(): void { limits.value = resetImportLimits(); error.value = ''; emit('announce', 'Limites de tamanho restaurados para os padrões.'); }
const isDefault = (): boolean => JSON.stringify(limits.value) === JSON.stringify(DEFAULT_IMPORT_LIMITS);
</script>

<template>
  <section class="card" aria-labelledby="imp-h" data-testid="import-limits-panel">
    <h2 id="imp-h">Tamanho de arquivos importados</h2>
    <p class="muted">Vale para apps que importam mídia, como o Versos. Acima do <strong>aviso</strong> você vê um alerta; acima do <strong>máximo</strong> o arquivo não é importado.</p>
    <label class="sw" :class="{ on: limits.enabled }">
      <input type="checkbox" :checked="limits.enabled" data-testid="import-limits-enabled" @change="toggle(($event.target as HTMLInputElement).checked)" />
      <span><strong>Aplicar limites de tamanho</strong><small>Desligado, nada é bloqueado ou avisado por tamanho. Os limites reais do navegador e do aparelho (memória, codecs, espaço) continuam existindo e os erros são mostrados.</small></span>
    </label>
    <ul class="rows" :class="{ off: !limits.enabled }">
      <li v-for="r in rows" :key="r.kind" :data-kind="r.kind">
        <div class="nm"><strong>{{ r.title }}</strong><span class="muted">{{ r.help }}</span></div>
        <label class="num"><span>Avisar acima de (MB)</span>
          <input type="number" inputmode="decimal" :min="MIN_LIMIT_MB" :max="MAX_LIMIT_MB" step="1" :value="limits[r.kind].warn" :disabled="!limits.enabled" :data-testid="'import-warn-' + r.kind" @change="setValue(r.kind, 'warn', ($event.target as HTMLInputElement).value)" />
        </label>
        <label class="num"><span>Bloquear acima de (MB)</span>
          <input type="number" inputmode="decimal" :min="MIN_LIMIT_MB" :max="MAX_LIMIT_MB" step="1" :value="limits[r.kind].max" :disabled="!limits.enabled" :data-testid="'import-max-' + r.kind" @change="setValue(r.kind, 'max', ($event.target as HTMLInputElement).value)" />
        </label>
      </li>
    </ul>
    <p v-if="error" class="err" role="alert" data-testid="import-limits-error">{{ error }}</p>
    <p><button type="button" class="btn" :disabled="isDefault()" data-testid="import-limits-reset" @click="restore">Restaurar padrões</button></p>
  </section>
</template>

<style scoped>
.card { max-width: 720px; margin-bottom: 16px; padding: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; }
h2 { font-size: 18px; }
.sw { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; min-height: 44px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); cursor: pointer; }
.sw.on { border-color: var(--accent); box-shadow: inset 3px 0 var(--accent); }
.sw input { margin-top: 4px; width: 18px; height: 18px; flex: none; }
.sw span { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sw small { color: var(--muted); font-size: 12px; }
.rows { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 8px; }
.rows.off { opacity: .6; }
.rows li { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px 14px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); }
.nm { flex: 1 1 220px; min-width: 0; display: flex; flex-direction: column; font-size: 14px; }
.nm .muted { font-size: 12px; }
.num { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
.num input { width: 110px; min-height: 44px; padding: 0 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); color: var(--text); font-size: 14px; }
.err { margin: 8px 0 0; color: var(--danger); font-weight: 600; }
</style>
