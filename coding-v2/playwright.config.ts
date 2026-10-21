import { defineConfig } from '@playwright/test';

// Os testes de interface rodam contra o build real (vite preview).
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://127.0.0.1:4173' },
  webServer: {
    command: 'npx vite preview --port 4173 --host 127.0.0.1 --strictPort',
    url: 'http://127.0.0.1:4173/launcher/',
    reuseExistingServer: !process.env.CI,
    timeout: 60000
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
});
