import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/acceptance',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['junit', { outputFile: 'artifacts/acceptance.xml' }], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop-chromium', use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile-chromium', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }
  ],
  webServer: {
    command: 'node src/server.js',
    url: 'http://127.0.0.1:3100/healthz',
    reuseExistingServer: false,
    timeout: 30000,
    env: { HOST: '127.0.0.1', PORT: '3100', ENABLE_LIVE: 'false', REQUIRE_PLATFORM_AUTH: 'false', WEBSITE_INSTANCE_ID: '' }
  }
});
