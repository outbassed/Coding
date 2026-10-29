import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import { versionsRoutes } from './scripts/versions-routes-plugin';
import { appAliases } from './scripts/app-aliases-plugin';

// Entradas HTML independentes. Nunca aponta para o index.html antigo da raiz do repo.
export default defineConfig({
  plugins: [vue(), tailwindcss(), versionsRoutes(), appAliases()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        root: resolve(import.meta.dirname, 'index.html'),
        launcher: resolve(import.meta.dirname, 'launcher/index.html'),
        versoes: resolve(import.meta.dirname, 'versoes/index.html'),
        etiquetas: resolve(import.meta.dirname, 'apps/etiquetas/index.html'),
        texto: resolve(import.meta.dirname, 'apps/texto/index.html'),
        'planilhas': resolve(import.meta.dirname, 'apps/planilhas/index.html'),
        'imagens': resolve(import.meta.dirname, 'apps/imagens/index.html'),
        'pdf': resolve(import.meta.dirname, 'apps/pdf/index.html'),
        'qr': resolve(import.meta.dirname, 'apps/qr/index.html'),
        'planilha-etiquetas': resolve(import.meta.dirname, 'apps/planilha-etiquetas/index.html'),
        'sorteio': resolve(import.meta.dirname, 'apps/sorteio/index.html'),
        'racha-conta': resolve(import.meta.dirname, 'apps/racha-conta/index.html'),
        'calculadora': resolve(import.meta.dirname, 'apps/calculadora/index.html'),
        'cores': resolve(import.meta.dirname, 'apps/cores/index.html'),
        'zip': resolve(import.meta.dirname, 'apps/zip/index.html'),
        'comparador': resolve(import.meta.dirname, 'apps/comparador/index.html'),
        'codigo': resolve(import.meta.dirname, 'apps/codigo/index.html'),
        'visualizador': resolve(import.meta.dirname, 'apps/visualizador/index.html'),
        'pintar': resolve(import.meta.dirname, 'apps/pintar/index.html'),
        'versos': resolve(import.meta.dirname, 'apps/versos/index.html')
      }
    }
  }
});
