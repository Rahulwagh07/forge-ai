import { defineConfig, devices } from '@playwright/test'
import { STORAGE_STATE_PATH } from './helpers/env.ts'

const BASE_URL = 'http://localhost:3000'
const TEST_TIMEOUT_MS = 240_000
const EXPECT_TIMEOUT_MS = 15_000
const WEBSERVER_TIMEOUT_MS = 120_000

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: TEST_TIMEOUT_MS,
  expect: { timeout: EXPECT_TIMEOUT_MS },
  reporter: [['list']],
  outputDir: './test-results',
  use: {
    baseURL: BASE_URL,
    storageState: STORAGE_STATE_PATH,
    headless: true,
    viewport: { width: 1440, height: 900 },
    actionTimeout: EXPECT_TIMEOUT_MS,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'bun run dev',
    cwd: '../apps/web',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: WEBSERVER_TIMEOUT_MS,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
