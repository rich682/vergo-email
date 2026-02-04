import { defineConfig, devices } from '@playwright/test'
import * as fs from 'fs'

const authFile = 'playwright/.auth/user.json'

// Check if auth file exists at config load time
const authFileExists = fs.existsSync(authFile)

/**
 * Playwright E2E Test Configuration
 * 
 * Run against production with TEST_BASE_URL environment variable:
 * TEST_BASE_URL=https://your-app.vercel.app npm run test:e2e
 */

export default defineConfig({
  testDir: './e2e/tests',
  
  /* Run tests in files in parallel */
  fullyParallel: false, // Disabled - tests may depend on shared state
  
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Reporter to use */
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  
  /* Shared settings for all the projects below */
  use: {
    /* Base URL from environment or default to localhost */
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:3001',
    
    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    
    /* Screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Video on failure */
    video: 'on-first-retry',
  },

  /* Global timeout for each test */
  timeout: 60000, // Increased for CI
  
  /* Timeout for each expect() assertion */
  expect: {
    timeout: 15000,
  },

  /* Configure projects for major browsers */
  projects: [
    /* Setup project for authentication */
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      timeout: 120000, // 2 min timeout for auth
    },
    
    /* Main tests with Chromium - don't require auth file, tests handle it */
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        /* Only use auth state if file exists, otherwise tests will auth inline */
        ...(authFileExists ? { storageState: authFile } : {}),
      },
      dependencies: ['setup'],
    },
  ],

  /* Output directory for test artifacts */
  outputDir: 'test-results/',
})
