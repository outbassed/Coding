<template>
  <!-- A animação pertence exclusivamente à tela de detalhes do Visualizador.
       Nos demais lugares, a marca continua sendo o SVG estático original. -->
  <span class="app-icon viewer-eye-detail" aria-hidden="true" data-testid="viewer-animated-icon">
    <svg class="viewer-eye-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" focusable="false">
      <defs>
        <linearGradient id="viewer-eye-detail-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ecb6f5" />
          <stop offset="1" stop-color="#9a4fbd" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="url(#viewer-eye-detail-gradient)" />
      <path d="M5 24s7-12 19-12 19 12 19 12-7 12-19 12S5 24 5 24z" fill="#fff" />
      <!-- Íris, pupila e reflexo se deslocam juntos, sem deformar a marca. -->
      <g class="viewer-eye-pupil" data-testid="viewer-eye-pupil">
        <circle cx="24" cy="24" r="8.5" fill="#7a3a9a" />
        <circle cx="24" cy="24" r="4" fill="#2a0f38" />
        <circle cx="26.6" cy="21.4" r="1.7" fill="#fff" />
      </g>
    </svg>
  </span>
</template>

<style scoped>
.viewer-eye-detail {
  display: inline-grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  place-items: center;
  width: 80px;
  height: 80px;
  flex: 0 0 auto;
  overflow: hidden;
  border-radius: 25%;
}
.viewer-eye-svg { display: block; width: 100%; height: 100%; }
.viewer-eye-pupil {
  animation: viewer-look-around 2.8s ease-in-out 350ms 1 both;
}
@keyframes viewer-look-around {
  0%, 12%, 85%, 100% { transform: translateX(0); }
  26%, 37% { transform: translateX(-4px); }
  56%, 68% { transform: translateX(4px); }
}
@media (prefers-reduced-motion: reduce) {
  .viewer-eye-pupil { animation: none; }
}
</style>
