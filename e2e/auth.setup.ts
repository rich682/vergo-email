import { test as setup, expect } from '@playwright/test'

const authFile = 'playwright/.auth/user.json'

/**
 * Authentication Setup
 * 
 * Logs in once and saves the session state for reuse across all tests.
 * Run before all other tests via the 'setup' project dependency.
 */
setup('authenticate', async ({ page }) => {
  // Get credentials from environment
  const email = process.env.TEST_USER_EMAIL
  const password = process.env.TEST_USER_PASSWORD
  
  if (!email || !password) {
    throw new Error(
      'Missing test credentials. Set TEST_USER_EMAIL and TEST_USER_PASSWORD environment variables.'
    )
  }

  // Navigate to sign in page
  await page.goto('/auth/signin')
  
  // Wait for the sign in form to be visible
  await expect(page.locator('form')).toBeVisible({ timeout: 10000 })
  
  // Fill in credentials
  await page.fill('input[name="email"], input[type="email"]', email)
  await page.fill('input[name="password"], input[type="password"]', password)
  
  // Click sign in button
  await page.click('button[type="submit"]')
  
  // Wait for successful redirect to dashboard
  await page.waitForURL(/\/dashboard/, { timeout: 30000 })
  
  // Verify we're logged in by checking for dashboard content
  await expect(page.locator('text=Tasks').or(page.locator('[data-testid="sidebar"]'))).toBeVisible({ timeout: 10000 })
  
  // Save signed-in state to reuse across tests
  await page.context().storageState({ path: authFile })
})
