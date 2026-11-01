import { defineConfig } from '@playwright/test';

/** Configuração só do robô de capturas (não roda junto com os testes: `npm run test:e2e` usa playwright.config.ts). */
const touch = { isMobile: true, hasTouch: true };
const devices = [
  { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  { name: 'notebook', use: { viewport: { width: 1280, height: 720 } } },
  { name: 'tablet-retrato', use: { viewport: { width: 820, height: 1180 }, ...touch } },
  { name: 'tablet-paisagem', use: { viewport: { width: 1180, height: 820 }, hasTouch: true } },
  { name: 'celular', use: { viewport: { width: 390, height: 844 }, ...touch } },
  { name: 'celular-pequeno', use: { viewport: { width: 360, height: 640 }, ...touch } }
];
const wanted = (process.env.SHOTS_DEVICES ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export default defineConfig({
  testDir: 'shots',
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', deviceScaleFactor: 1 },
  webServer: {
    command: 'npx vite preview --port 4173 --host 127.0.0.1 --strictPort',
    url: 'http://127.0.0.1:4173/launcher/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  },
  projects: devices.filter((d) => wanted.length === 0 || wanted.includes(d.name))
});
