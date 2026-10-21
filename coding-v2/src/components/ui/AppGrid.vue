<template>
  <div class="grid"><slot /></div>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr)); gap: 16px; }
@media (max-width: 599px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; } }
@media (max-width: 359px) { .grid { grid-template-columns: minmax(0, 1fr); } }
</style>
