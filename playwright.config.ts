import { defineConfig, devices } from '@playwright/test'

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
  timeout: 30000,
  
  /* Timeout for each expect() assertion */
  expect: {
    timeout: 10000,
  },

  /* Configure projects for major browsers */
  projects: [
    /* Setup project for authentication */
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    
    /* Main tests with Chromium */
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        /* Use prepared auth state */
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  /* Output directory for test artifacts */
  outputDir: 'test-results/',
})
