import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

// Entradas HTML independentes. Nunca aponta para o index.html antigo da raiz do repo.
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        root: resolve(import.meta.dirname, 'index.html'),
        launcher: resolve(import.meta.dirname, 'launcher/index.html'),
        etiquetas: resolve(import.meta.dirname, 'apps/etiquetas/index.html'),
        texto: resolve(import.meta.dirname, 'apps/texto/index.html')
      }
    }
  }
});
