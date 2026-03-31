import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3848',
    headless: true,
  },
  webServer: {
    command: 'pnpm dev --port 3848',
    port: 3848,
    reuseExistingServer: true,
    timeout: 30000,
  },
});
