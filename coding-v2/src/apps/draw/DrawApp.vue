<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import EditorShell from '../../editors/EditorShell.vue';
import FileTab from '../../editors/FileTab.vue';
import { useDocument } from '../../editors/useDocument';
import { useMediaQuery } from '../../composables/useMediaQuery';
import { downloadText, safeFileName } from '../../shared/files/download';
import { MAX_HISTORY, available, cleanNames, drawNumbers, makeTeams, pickName, rollDice, wheelAngle, type DrawMode } from './model';
import { drawKind, drawTemplates } from './kind';

const doc = useDocument({ kind: drawKind, templates: drawTemplates, path: '/apps/sorteio/' });
const { state } = doc;
const tabs = [{ id: 'wheel', label: 'Roleta' }, { id: 'numbers', label: 'Números' }, { id: 'dice', label: 'Dados' }, { id: 'teams', label: 'Equipes' }, { id: 'arquivo', label: 'Arquivo' }];
const tab = ref<string>(state.value.mode);
watch(tab, (t) => { if (t !== 'arquivo' && t !== state.value.mode) state.value.mode = t as DrawMode; });
watch(() => state.value.mode, (m) => { if (tab.value !== 'arquivo') tab.value = m; });
const reduced = useMediaQuery('(prefers-reduced-motion: reduce)', false);

const namesText = computed({
  get: () => state.value.participants.join('\n'),
  set: (v: string) => { state.value.participants = v.split(/\r?\n/).slice(0, 500).map((x) => x.slice(0, 80)); }
});
const pool = computed(() => available(state.value));
const total = computed(() => cleanNames(state.value.participants).length);
const result = ref<{ mode: DrawMode; title: string; lines: string[] } | null>(null);
const error = ref('');
const spinning = ref(false);
const rotation = ref(0);
const wheelNames = ref<string[]>([]);
watch(pool, (p) => { if (!spinning.value) wheelNames.value = p.slice(0, 200); }, { immediate: true });
const COLORS = ['#F5B820', '#4C8DF6', '#E8538F', '#34A853', '#976DF7', '#F28B30', '#14B8A6', '#E75358'];

function segPath(i: number, n: number): string {
  if (n === 1) return 'M 100 100 m -96 0 a 96 96 0 1 0 192 0 a 96 96 0 1 0 -192 0';
  const a0 = (i / n) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
  const x0 = 100 + 96 * Math.cos(a0), y0 = 100 + 96 * Math.sin(a0), x1 = 100 + 96 * Math.cos(a1), y1 = 100 + 96 * Math.sin(a1);
  return `M100 100 L${x0.toFixed(2)} ${y0.toFixed(2)} A96 96 0 ${1 / n > 0.5 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}
const labelAngle = (i: number, n: number): number => ((i + 0.5) / n) * 360 - 90;
const labelSize = computed(() => Math.max(5, Math.min(13, 150 / Math.max(1, wheelNames.value.length))));
const short = (s: string) => (s.length > 14 ? s.slice(0, 13) + '…' : s);

function record(mode: DrawMode, text: string): void {
  state.value.history.push({ at: Date.now(), mode, text });
  if (state.value.history.length > MAX_HISTORY) state.value.history.splice(0, state.value.history.length - MAX_HISTORY);
}
let spinTimer: ReturnType<typeof setTimeout> | undefined;
function spin(): void {
  error.value = '';
  if (spinning.value) return;
  const list = pool.value;
  if (!list.length) { error.value = total.value ? 'Todos os nomes já foram sorteados. Use “Recomeçar” para liberar a lista.' : 'Adicione nomes à lista para girar a roleta.'; return; }
  wheelNames.value = list.slice(0, 200);
  const winner = pickName(wheelNames.value);
  spinning.value = true;
  rotation.value = wheelAngle(winner.index, wheelNames.value.length, rotation.value, reduced.value ? 0 : 5);
  const finish = (): void => {
    spinning.value = false;
    if (state.value.excludeDrawn) state.value.drawn.push(winner.name);
    record('wheel', winner.name);
    result.value = { mode: 'wheel', title: 'Sorteado', lines: [winner.name] };
    doc.say('Resultado da roleta: ' + winner.name);
  };
  clearTimeout(spinTimer);
  spinTimer = setTimeout(finish, reduced.value ? 0 : 4300);
}
onBeforeUnmount(() => clearTimeout(spinTimer));
function resetDrawn(): void { state.value.drawn = []; result.value = null; doc.say('Lista liberada: todos os nomes podem ser sorteados de novo.'); }
function runNumbers(): void {
  error.value = '';
  try {
    const list = drawNumbers(state.value.numbers);
    const text = list.join(', ');
    result.value = { mode: 'numbers', title: list.length === 1 ? 'Número sorteado' : 'Números sorteados', lines: list.map(String) };
    record('numbers', text); doc.say('Números sorteados: ' + text);
  } catch (e) { error.value = (e as Error).message; }
}
function runDice(): void {
  const list = rollDice(state.value.dice);
  const sum = list.reduce((s, v) => s + v, 0);
  result.value = { mode: 'dice', title: 'Soma ' + sum, lines: list.map(String) };
  record('dice', list.join(' + ') + ' = ' + sum); doc.say('Dados: ' + list.join(', ') + '. Soma ' + sum + '.');
}
const teams = ref<string[][]>([]);
function runTeams(): void {
  error.value = '';
  try {
    teams.value = makeTeams(cleanNames(state.value.participants), state.value.teams.count);
    const text = teams.value.map((t, i) => 'Equipe ' + (i + 1) + ': ' + t.join(', ')).join(' | ');
    result.value = { mode: 'teams', title: 'Equipes', lines: [] };
    record('teams', text); doc.say('Equipes geradas. ' + text);
  } catch (e) { error.value = (e as Error).message; }
}
function clearHistory(): void { if (confirm('Apagar o histórico de resultados deste sorteio?')) { state.value.history = []; result.value = null; } }
const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const modeName: Record<DrawMode, string> = { wheel: 'Roleta', numbers: 'Números', dice: 'Dados', teams: 'Equipes' };
function exportHistory(): void {
  const lines = [state.value.name, '', ...state.value.history.map((h) => dateFmt.format(h.at) + ' · ' + modeName[h.mode] + ' · ' + h.text)];
  downloadText(lines.join('\n') + '\n', safeFileName(state.value.name, 'sorteio') + '.txt');
  doc.say('Histórico exportado.');
}
const dicePips: Record<number, number[][]> = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[28, 28], [50, 50], [72, 72]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]], 6: [[28, 25], [72, 25], [28, 50], [72, 50], [28, 75], [72, 75]] };
</script>

<template>
  <EditorShell v-model:tab="tab" app="draw" :doc="doc" :tabs="tabs">
    <template #panel="{ tab: current }">
      <div v-if="current === 'wheel' || current === 'teams'" class="ed-group">
        <label class="ed-field"><span class="ed-label">Participantes (um por linha) · {{ total }}</span>
          <textarea v-model="namesText" class="inp names" rows="5" data-testid="names" @input="doc.setChangeKey('names')"></textarea></label>
        <div v-if="current === 'wheel'" class="ed-row">
          <label class="check"><input v-model="state.excludeDrawn" type="checkbox" data-testid="exclude" /> Não repetir quem já saiu</label>
          <button type="button" class="btn" :disabled="!state.drawn.length" data-testid="reset-drawn" @click="resetDrawn">Recomeçar ({{ state.drawn.length }} já sorteados)</button>
        </div>
        <div v-else class="ed-row">
          <label class="ed-field"><span class="ed-label">Número de equipes</span><input v-model.number="state.teams.count" class="inp inp-num" type="number" min="2" max="50" data-testid="team-count" /></label>
        </div>
      </div>
      <div v-else-if="current === 'numbers'" class="ed-row">
        <label class="ed-field"><span class="ed-label">De</span><input v-model.number="state.numbers.min" class="inp inp-num" type="number" data-testid="num-min" /></label>
        <label class="ed-field"><span class="ed-label">Até</span><input v-model.number="state.numbers.max" class="inp inp-num" type="number" data-testid="num-max" /></label>
        <label class="ed-field"><span class="ed-label">Quantidade</span><input v-model.number="state.numbers.count" class="inp inp-num" type="number" min="1" max="100" data-testid="num-count" /></label>
        <label class="check"><input v-model="state.numbers.unique" type="checkbox" /> Sem repetir</label>
      </div>
      <div v-else-if="current === 'dice'" class="ed-row">
        <label class="ed-field"><span class="ed-label">Dados</span><input v-model.number="state.dice.count" class="inp inp-num" type="number" min="1" max="12" data-testid="dice-count" /></label>
        <label class="ed-field"><span class="ed-label">Faces</span>
          <select v-model.number="state.dice.sides" class="inp"><option v-for="f in [4, 6, 8, 10, 12, 20, 100]" :key="f" :value="f">d{{ f }}</option></select></label>
      </div>
      <FileTab v-else :templates="drawTemplates" @new="doc.newFrom">
        <button type="button" class="btn" :disabled="!state.history.length" data-testid="export-history" @click="exportHistory">Exportar histórico (TXT)</button>
        <button type="button" class="btn" :disabled="!state.history.length" @click="clearHistory">Limpar histórico</button>
      </FileTab>
    </template>

    <div class="stage" :data-mode="state.mode">
      <div class="play">
        <template v-if="state.mode === 'wheel'">
          <div class="wheel-box">
            <span class="pointer" aria-hidden="true">▼</span>
            <svg viewBox="0 0 200 200" class="wheel" :class="{ animated: !reduced }" :style="{ transform: 'rotate(' + rotation + 'deg)' }" role="img" :aria-label="'Roleta com ' + wheelNames.length + ' nomes'" data-testid="wheel">
              <circle cx="100" cy="100" r="98" fill="var(--surface)" stroke="var(--border)" stroke-width="2" />
              <template v-if="wheelNames.length">
                <g v-for="(n, i) in wheelNames" :key="i + n">
                  <path :d="segPath(i, wheelNames.length)" :fill="COLORS[i % COLORS.length]" stroke="#fff" stroke-width="1" />
                  <text :transform="'rotate(' + labelAngle(i, wheelNames.length) + ' 100 100)'" x="190" y="100" text-anchor="end" dominant-baseline="middle" :font-size="labelSize" fill="#141922" font-weight="700">{{ short(n) }}</text>
                </g>
              </template>
              <circle cx="100" cy="100" r="12" fill="#fff" stroke="#141922" stroke-width="2" />
            </svg>
          </div>
          <button type="button" class="btn btn-app big" :disabled="spinning" data-testid="spin" @click="spin">{{ spinning ? 'Girando…' : 'Girar a roleta' }}</button>
          <p class="muted small">{{ pool.length }} de {{ total }} nomes disponíveis</p>
        </template>
        <template v-else-if="state.mode === 'numbers'">
          <button type="button" class="btn btn-app big" data-testid="draw-numbers" @click="runNumbers">Sortear {{ state.numbers.count === 1 ? 'número' : state.numbers.count + ' números' }}</button>
          <p class="muted small">Entre {{ state.numbers.min }} e {{ state.numbers.max }}{{ state.numbers.unique ? ', sem repetir' : '' }}</p>
        </template>
        <template v-else-if="state.mode === 'dice'">
          <div v-if="result?.mode === 'dice'" class="dice" aria-hidden="true">
            <svg v-for="(v, i) in result.lines" :key="i" viewBox="0 0 100 100" width="64" height="64"><rect x="4" y="4" width="92" height="92" rx="18" fill="#fff" stroke="#141922" stroke-width="4" />
              <template v-if="Number(v) <= 6"><circle v-for="(p, k) in dicePips[Number(v)]" :key="k" :cx="p[0]" :cy="p[1]" r="8" fill="#141922" /></template>
              <text v-else x="50" y="58" text-anchor="middle" font-size="34" font-weight="800" fill="#141922">{{ v }}</text></svg>
          </div>
          <button type="button" class="btn btn-app big" data-testid="roll" @click="runDice">Rolar {{ state.dice.count }}d{{ state.dice.sides }}</button>
        </template>
        <template v-else>
          <button type="button" class="btn btn-app big" data-testid="make-teams" @click="runTeams">Gerar {{ state.teams.count }} equipes</button>
          <div v-if="teams.length" class="teams" data-testid="teams">
            <section v-for="(t, i) in teams" :key="i" class="team"><h3>Equipe {{ i + 1 }}</h3><ol><li v-for="n in t" :key="n">{{ n }}</li></ol></section>
          </div>
        </template>
        <p v-if="error" class="ed-error" role="alert" data-testid="draw-error">{{ error }}</p>
        <div v-if="result && result.mode === state.mode && result.mode !== 'teams'" class="result" data-testid="draw-result">
          <span class="muted">{{ result.title }}</span>
          <strong>{{ result.lines.join(', ') }}</strong>
        </div>
      </div>
      <section class="history" aria-labelledby="hist-h">
        <h2 id="hist-h">Histórico ({{ state.history.length }})</h2>
        <ol v-if="state.history.length" reversed data-testid="history">
          <li v-for="(h, i) in [...state.history].reverse().slice(0, 30)" :key="i"><small class="muted">{{ dateFmt.format(h.at) }} · {{ modeName[h.mode] }}</small> {{ h.text }}</li>
        </ol>
        <p v-else class="muted small">Os resultados aparecem aqui e ficam salvos no documento.</p>
      </section>
    </div>
  </EditorShell>
</template>

<style scoped>
.names { width: 100%; min-height: 120px; resize: vertical; font-size: 16px; }
.check { display: inline-flex; gap: 8px; align-items: center; min-height: 44px; font-weight: 600; }
.check input { width: 20px; height: 20px; }
.stage { display: grid; gap: 18px; max-width: 980px; margin: 0 auto; padding: 16px max(16px, var(--sa-r)) 28px max(16px, var(--sa-l)); }
@media (min-width: 900px) { .stage { grid-template-columns: minmax(0, 1fr) 300px; align-items: start; } }
.play { display: grid; justify-items: center; gap: 12px; text-align: center; }
.wheel-box { position: relative; width: min(78vw, 46vh, 420px); aspect-ratio: 1; }
.wheel { width: 100%; height: 100%; display: block; }
.wheel.animated { transition: transform 4.2s cubic-bezier(.12, .7, .14, 1); }
.pointer { position: absolute; top: -6px; left: 50%; transform: translateX(-50%); z-index: 1; font-size: 26px; color: var(--text); line-height: 1; }
.big { min-height: 52px; font-size: 16px; padding: 0 24px; }
.small { font-size: 13px; margin: 0; }
.result { display: grid; gap: 4px; padding: 14px 20px; border-radius: 16px; background: var(--surface); border: 2px solid var(--app); min-width: min(320px, 100%); }
.result strong { font-size: clamp(24px, 6vw, 40px); overflow-wrap: anywhere; }
.dice { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
.teams { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; width: 100%; text-align: left; }
.team { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 10px 12px; }
.team h3 { margin: 0 0 6px; font-size: 15px; }
.team ol { margin: 0; padding-left: 20px; }
.history { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 12px 14px; }
.history h2 { font-size: 16px; margin: 0 0 8px; }
.history ol { margin: 0; padding-left: 22px; display: grid; gap: 4px; max-height: 40vh; overflow: auto; }
</style>
