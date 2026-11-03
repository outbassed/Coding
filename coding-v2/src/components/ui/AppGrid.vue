<template><div class="grid" data-testid="app-grid"><slot /></div></template>
<style scoped>
.grid { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:14px; align-items:stretch; }
@media(max-width:599px) { .grid { grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; } }
@media(min-width:600px) and (max-width:899px) { .grid { grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; } }
@media(min-width:1280px) { .grid { grid-template-columns:repeat(6,minmax(0,1fr)); } }
@media(min-width:1700px) { .grid { grid-template-columns:repeat(7,minmax(0,1fr)); } }
</style>