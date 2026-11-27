// Auslieferungstest (WP-19): fertiger Build unter einem Unterpfad, mit Service Worker, offline.
// Aufruf: npx playwright test -c tests/delivery/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  outputDir: '../../test-results/delivery',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4174/habla/',
    locale: 'de-DE',
    serviceWorkers: 'allow',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
    ...devices['Desktop Chrome'],
    viewport: { width: 400, height: 820 },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npx vite build --logLevel error && node --experimental-strip-types --no-warnings tests/delivery/serve.ts 4174',
    url: 'http://localhost:4174/habla/',
    cwd: '../..',
    reuseExistingServer: false,
    timeout: 120_000,
    // Echte Aufnahmen bleiben draußen; der Testserver liefert eigene Testtöne.
    env: { HABLA_AUDIO: 'off' },
  },
});
