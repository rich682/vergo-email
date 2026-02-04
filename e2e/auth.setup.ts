import { test as setup, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

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
  const baseUrl = process.env.TEST_BASE_URL
  
  console.log(`Auth setup starting...`)
  console.log(`Base URL: ${baseUrl || 'not set'}`)
  console.log(`Email: ${email ? email.substring(0, 3) + '***' : 'not set'}`)
  console.log(`Password: ${password ? '***set***' : 'not set'}`)
  
  if (!email || !password) {
    throw new Error(
      'Missing test credentials. Set TEST_USER_EMAIL and TEST_USER_PASSWORD environment variables.'
    )
  }

  // Ensure auth directory exists
  const authDir = path.dirname(authFile)
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true })
  }

  // Navigate to sign in page
  console.log('Navigating to sign in page...')
  await page.goto('/auth/signin')
  
  // Take screenshot for debugging
  await page.screenshot({ path: 'test-results/auth-page.png' })
  
  // Wait for the sign in form to be visible
  console.log('Waiting for form...')
  await expect(page.locator('form')).toBeVisible({ timeout: 15000 })
  
  // Fill in credentials
  console.log('Filling credentials...')
  await page.fill('input[name="email"], input[type="email"]', email)
  await page.fill('input[name="password"], input[type="password"]', password)
  
  // Take screenshot before submit
  await page.screenshot({ path: 'test-results/auth-filled.png' })
  
  // Click sign in button
  console.log('Clicking submit...')
  await page.click('button[type="submit"]')
  
  // Wait for successful redirect to dashboard
  console.log('Waiting for redirect to dashboard...')
  await page.waitForURL(/\/dashboard/, { timeout: 30000 })
  
  // Take screenshot after login
  await page.screenshot({ path: 'test-results/auth-success.png' })
  
  // Verify we're logged in by checking for dashboard content
  await expect(page.locator('text=Tasks').or(page.locator('[data-testid="sidebar"]'))).toBeVisible({ timeout: 10000 })
  
  console.log('Auth successful, saving state...')
  
  // Save signed-in state to reuse across tests
  await page.context().storageState({ path: authFile })
  
  console.log('Auth setup complete!')
})
