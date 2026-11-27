// Browser-Ende-zu-Ende-Test für Habla (WP-02). Aufruf: npm run e2e
// Liegt in tests/e2e, damit sie zum Prüfbereich gehört; Pfade sind relativ zu dieser Datei.
// Baut die App, startet die Vorschau auf Port 4173 und testet sie in Chromium.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  outputDir: '../../test-results',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'de-DE',
    viewport: { width: 400, height: 820 },
    serviceWorkers: 'block',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
    ...devices['Desktop Chrome'],
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium', viewport: { width: 400, height: 820 } } }],
  webServer: {
    command: 'npx vite build --logLevel error && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    cwd: '../..',
    reuseExistingServer: false,
    timeout: 120_000,
    // Gleicher Test auf jedem Rechner: vorhandene Aufnahmen in audio/ nicht in den Build übernehmen
    // (Szenarien mit Aufnahmen stellen ihr Verzeichnis selbst bereit).
    env: { HABLA_AUDIO: 'off' },
  },
});
