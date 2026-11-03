<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { tools } from '../../shared/catalog';
import AppIcon from './AppIcon.vue';
import {
  chooseTier, clearOverride, effectiveLimit, explainElevation, minTierFor, tierOptions, TIERS, useAutomatic, type LimitSettings, type Tier
} from '../../workspace/limits';
import { getStartup, loadLimitSettings, loadRecommended, refreshRecommendation, saveLimitSettings, setStartup, STARTUP_OPTIONS, type Startup } from '../../workspace/prefs';

const props = defineProps<{ counts: Record<string, number> | null }>();
const emit = defineEmits<{ announce: [text: string] }>();

const settings = ref<LimitSettings>(loadLimitSettings());
const recommended = ref<Tier>(loadRecommended());
const startup = ref<Startup>(getStartup());
const error = ref('');
onMounted(async () => { recommended.value = await refreshRecommendation(); });

const countOf = (key: string): number => props.counts?.[key] ?? 0;
const maxSaved = computed(() => Math.max(0, ...tools.map((t) => countOf(t.id))));
const globalOptions = computed(() => tierOptions(maxSaved.value));
const rows = computed(() => tools.map((t) => {
  const saved = countOf(t.id);
  const effective = effectiveLimit(settings.value, t.id, saved, recommended.value);
  return { tool: t, saved, effective, options: tierOptions(saved), override: settings.value.overrides[t.id] ?? 0, note: explainElevation(effective) };
}));

function persist(next: LimitSettings, message: string): void {
  if (!saveLimitSettings(next)) { error.value = 'Este navegador não permitiu guardar o ajuste. Nada foi alterado.'; return; }
  settings.value = loadLimitSettings(); error.value = '';
  emit('announce', message);
}
function setAuto(): void { persist(useAutomatic(settings.value), 'Limite automático ativado.'); }
function setGlobal(tier: Tier): void {
  const result = chooseTier(settings.value, null, tier, maxSaved.value);
  if (!result.ok) { error.value = result.error; return; }
  persist(result.settings, 'Limite padrão: ' + tier + ' projetos por app.');
}
function setApp(key: string, name: string, raw: string): void {
  const value = Number(raw);
  if (!value) { persist(clearOverride(settings.value, key), name + ' volta a seguir o limite padrão.'); return; }
  const result = chooseTier(settings.value, key, value, countOf(key));
  if (!result.ok) { error.value = result.error; return; }
  persist(result.settings, name + ': limite de ' + value + ' projetos.');
}
function setStart(value: Startup): void { startup.value = value; setStartup(value); emit('announce', 'Ao abrir um app: ' + (STARTUP_OPTIONS.find((o) => o.id === value)?.label ?? '') + '.'); }
</script>

<template>
  <section class="card" aria-labelledby="start-h" data-testid="startup-panel">
    <h2 id="start-h">Ao abrir um app</h2>
    <p class="muted">O que cada app mostra quando você o abre pelo Launcher.</p>
    <div class="opts" role="radiogroup" aria-label="Ao abrir um app">
      <label v-for="o in STARTUP_OPTIONS" :key="o.id" class="radio" :class="{ on: startup === o.id }">
        <input type="radio" name="startup" :value="o.id" :checked="startup === o.id" :data-testid="'startup-' + o.id" @change="setStart(o.id)" />
        <span><strong>{{ o.label }}</strong><small>{{ o.help }}</small></span>
      </label>
    </div>
  </section>

  <section class="card" aria-labelledby="lim-h" data-testid="limits-panel">
    <h2 id="lim-h">Limite de projetos salvos</h2>
    <p class="muted">Cada app tem a sua própria contagem. O limite nunca apaga nada: se você já tem mais projetos do que o valor escolhido, o limite efetivo sobe para a faixa seguinte.</p>
    <div class="opts" role="radiogroup" aria-label="Modo do limite">
      <label class="radio" :class="{ on: settings.mode === 'auto' }">
        <input type="radio" name="limit-mode" :checked="settings.mode === 'auto'" data-testid="limit-auto" @change="setAuto" />
        <span><strong>Automático</strong><small>Sugestão para este aparelho: {{ recommended }} projetos por app (calculada com memória, núcleos, toque e espaço informados pelo navegador; é só uma estimativa).</small></span>
      </label>
      <label class="radio" :class="{ on: settings.mode === 'manual' }">
        <input type="radio" name="limit-mode" :checked="settings.mode === 'manual'" data-testid="limit-manual" @change="setGlobal(Math.max(settings.tier, minTierFor(maxSaved) ?? 1024) as Tier)" />
        <span><strong>Manual</strong><small>Você escolhe o limite padrão de todos os apps e, se quiser, um valor diferente para cada app.</small></span>
      </label>
    </div>

    <div v-if="settings.mode === 'manual'" class="tiers" role="group" aria-label="Limite padrão por app" data-testid="limit-tiers">
      <button v-for="o in globalOptions" :key="o.tier" type="button" class="opt" :aria-pressed="settings.tier === o.tier" :disabled="o.disabled" :title="o.reason"
        :data-testid="'tier-' + o.tier" @click="setGlobal(o.tier)">{{ o.tier }}</button>
    </div>
    <ul v-if="settings.mode === 'manual' && globalOptions.some((o) => o.disabled)" class="why" data-testid="tier-reasons">
      <li v-for="o in globalOptions.filter((x) => x.disabled)" :key="o.tier"><strong>{{ o.tier }}:</strong> {{ o.reason }}</li>
    </ul>
    <p v-if="error" class="err" role="alert" data-testid="limit-error">{{ error }}</p>

    <h3>Por app</h3>
    <ul class="apps" data-testid="limit-apps">
      <li v-for="r in rows" :key="r.tool.id" :data-app="r.tool.id">
        <AppIcon :id="r.tool.id" size="sm" />
        <div class="nm">
          <strong>{{ r.tool.name }}</strong>
          <span class="muted">{{ r.saved }} de {{ r.effective.limit }} salvos<template v-if="r.effective.full"> · cheio</template></span>
          <span v-if="r.note" class="muted note">{{ r.note }}</span>
        </div>
        <label class="sel">
          <span class="sr-only">Limite de {{ r.tool.name }}</span>
          <select :value="String(r.override)" :data-testid="'limit-' + r.tool.id" @change="setApp(r.tool.id, r.tool.name, ($event.target as HTMLSelectElement).value)">
            <option value="0">Seguir o padrão</option>
            <option v-for="o in r.options" :key="o.tier" :value="String(o.tier)" :disabled="o.disabled">{{ o.tier }}{{ o.disabled ? ' (indisponível: há ' + r.saved + ' salvos)' : '' }}</option>
          </select>
        </label>
      </li>
    </ul>
    <p class="muted">Faixas possíveis: {{ TIERS.join(', ') }}.</p>
  </section>
</template>

<style scoped>
.card { max-width: 720px; margin-bottom: 16px; padding: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; }
h2 { font-size: 18px; }
h3 { font-size: 14px; margin: 16px 0 8px; }
.opts { display: grid; gap: 8px; }
.radio { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; min-height: 44px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); cursor: pointer; }
.radio.on { border-color: var(--accent); box-shadow: inset 3px 0 var(--accent); }
.radio input { margin-top: 4px; width: 18px; height: 18px; flex: none; }
.radio span { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.radio small { color: var(--muted); font-size: 12px; }
.tiers { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.opt { min-width: 64px; min-height: 44px; padding: 0 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--panel); font-weight: 700; }
.opt[aria-pressed="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, var(--surface)); box-shadow: inset 0 -3px var(--accent); }
.opt:disabled { opacity: .55; cursor: not-allowed; }
.why { margin: 8px 0 0; padding-left: 18px; font-size: 12px; color: var(--muted); }
.err { margin: 8px 0 0; color: var(--danger); font-weight: 600; }
.apps { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.apps li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); min-width: 0; flex-wrap: wrap; }
.nm { flex: 1 1 160px; min-width: 0; display: flex; flex-direction: column; font-size: 14px; }
.nm .muted { font-size: 12px; }
.note { color: var(--text); }
.sel select { min-height: 44px; max-width: 100%; padding: 0 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); color: var(--text); font-size: 13px; }
</style>
