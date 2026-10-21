<script setup lang="ts">
// Folha ilustrativa 3 × 8 (24 etiquetas). Os textos são exemplos fixos, não dados do usuário.
const samples = [
  { code: 'A-001', desc: 'Parafusos M6' }, { code: 'A-002', desc: 'Porcas M6' }, { code: 'A-003', desc: 'Arruelas lisas' },
  { code: 'A-004', desc: 'Organizadores' }, { code: 'A-005', desc: 'Buchas 8 mm' }, { code: 'A-006', desc: 'Fita dupla face' }
];
const cells = Array.from({ length: 24 }, (_, i) => samples[i] ?? null);
</script>

<template>
  <div class="page" data-testid="labels-sheet">
    <div v-for="(cell, i) in cells" :key="i" class="cell" :class="{ empty: !cell }">
      <template v-if="cell"><b>{{ cell.code }}</b><span>{{ cell.desc }}</span></template>
    </div>
  </div>
</template>

<style scoped>
.page { width: 100%; height: 100%; display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(8, 1fr); padding: 4.3cqw 4.8cqw; }
.cell { border: 1px dashed #aab2c0; padding: 1.8cqw; display: flex; flex-direction: column; justify-content: center; overflow: hidden; }
.cell b { font-size: 3.4cqw; line-height: 1.2; }
.cell span { font-size: 2.4cqw; line-height: 1.3; color: #3d4657; }
.empty { border-color: #dde2ea; }
</style>
