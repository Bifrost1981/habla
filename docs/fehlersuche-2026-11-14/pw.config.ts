import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: /repro\.spec\.ts/, outputDir: './out', timeout: 60_000, workers: 1, reporter: [['list']],
  use: { baseURL: 'http://localhost:4191', locale: 'de-DE', viewport: { width: 400, height: 820 }, browserName: 'chromium',
         launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } },
  webServer: { command: 'npx vite preview --port 4191 --strictPort', url: 'http://localhost:4191', cwd: process.env.HABLA_WORK ?? './work', reuseExistingServer: false },
});
