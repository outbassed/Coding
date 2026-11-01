<script setup lang="ts">
import { computed } from 'vue';
import { formatBuildDateTime, formatRelease, historyPath, latestOf } from '../../shared/versions';
import { versionRecords } from '../../shared/versions-data';

/** Sobre: nome, versão, compilação, lançamento e o histórico — tudo do mesmo registro que a Central de Versões usa. */
const release = computed(() => latestOf('launcher', versionRecords));
const credits = [
  { name: 'pdf-lib', license: 'MIT', use: 'Editar e montar PDFs' },
  { name: 'PDF.js', license: 'Apache-2.0', use: 'Mostrar as páginas dos PDFs' },
  { name: 'qrcode-generator', license: 'MIT', use: 'Gerar QR codes' },
  { name: 'Fontes do Versos: Arimo, Montserrat, Oswald, Bebas Neue, Anton, Playfair Display, Cormorant Garamond, Lora, Great Vibes, Dancing Script, Pacifico e Caveat', license: 'SIL OFL 1.1 (avisos em /fonts/versos/)', use: 'Texto das cenas do Versos, incluídas no aplicativo' },
  { name: 'Vue, Pinia e Vue Router', license: 'MIT', use: 'Interface do Launcher e dos aplicativos' }
];
</script>

<template>
  <section class="card" aria-labelledby="sobre-h" data-testid="about-panel">
    <h2 id="sobre-h">Sobre</h2>
    <div class="id">
      <img src="/legacy-icons/coding.svg" alt="" width="56" height="56" draggable="false" />
      <div>
        <p class="name" data-testid="about-name">Coding</p>
        <p v-if="release" class="ver" data-testid="about-version">Versão {{ release.version }}</p>
      </div>
    </div>
    <dl v-if="release" class="meta">
      <div><dt>Versão</dt><dd data-testid="about-version-value">{{ release.version }}</dd></div>
      <div><dt>Compilação</dt><dd data-testid="about-build">{{ release.build }}</dd></div>
      <div><dt>Compilada em</dt><dd>{{ formatBuildDateTime(release.build) }}</dd></div>
      <div><dt>Publicada em</dt><dd data-testid="about-release">{{ formatRelease(release) }}</dd></div>
    </dl>
    <p><a :href="historyPath('launcher')" class="btn btn-primary history" data-testid="about-history">Histórico de versões</a></p>
    <p class="muted small">Cada aplicativo tem a sua própria versão; veja em Detalhes ou na Central de Versões.</p>
    <h3>Créditos</h3>
    <p class="muted small">Bibliotecas de terceiros usadas, com suas licenças originais incluídas no pacote.</p>
    <ul class="credits" data-testid="credits">
      <li v-for="c in credits" :key="c.name"><strong>{{ c.name }}</strong> <span class="muted">· {{ c.license }} · {{ c.use }}</span></li>
    </ul>
  </section>
</template>

<style scoped>
.card { max-width: 720px; padding: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; }
h2 { font-size: 18px; }
h3 { font-size: 15px; margin: 18px 0 4px; }
.id { display: flex; align-items: center; gap: 14px; margin: 6px 0 14px; }
.id img { border-radius: 14px; flex: none; }
.name { margin: 0; font-size: 22px; font-weight: 780; letter-spacing: -.02em; }
.ver { margin: 0; color: var(--muted); }
.meta { margin: 0 0 14px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 8px; }
.meta > div { min-width: 0; padding: 9px 12px; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; }
dt { font-size: 12.5px; color: var(--muted); }
dd { margin: 2px 0 0; font-weight: 700; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.history { min-width: min(260px, 100%); }
.small { font-size: 12.5px; margin: 0 0 8px; }
.credits { margin: 0; padding-left: 20px; display: grid; gap: 4px; }
</style>
