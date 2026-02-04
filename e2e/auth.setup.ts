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
  
  console.log(`=== AUTH SETUP STARTING ===`)
  console.log(`Base URL: ${baseUrl || 'not set'}`)
  console.log(`Email: ${email ? email.substring(0, 3) + '***' : 'not set'}`)
  console.log(`Password: ${password ? '***set***' : 'not set'}`)
  
  if (!email || !password) {
    // Create empty auth file to prevent cascading failures
    const authDir = path.dirname(authFile)
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true })
    }
    throw new Error(
      'Missing test credentials. Set TEST_USER_EMAIL and TEST_USER_PASSWORD environment variables.'
    )
  }

  // Ensure auth directory exists
  const authDir = path.dirname(authFile)
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true })
    console.log(`Created auth directory: ${authDir}`)
  }

  try {
    // Navigate to sign in page
    console.log('Navigating to sign in page...')
    await page.goto('/auth/signin', { waitUntil: 'networkidle', timeout: 60000 })
    
    // Take screenshot for debugging
    await page.screenshot({ path: 'test-results/auth-01-page-loaded.png' })
    console.log(`Current URL: ${page.url()}`)
    
    // Check if we're already logged in (redirected to dashboard)
    if (page.url().includes('/dashboard')) {
      console.log('Already logged in, saving state...')
      await page.context().storageState({ path: authFile })
      console.log('Auth setup complete (already authenticated)!')
      return
    }
    
    // Wait for the sign in form to be visible
    console.log('Waiting for form...')
    const form = page.locator('form')
    await expect(form).toBeVisible({ timeout: 30000 })
    
    // Try multiple selectors for email input
    console.log('Looking for email input...')
    const emailInput = page.locator('input[name="email"]').or(page.locator('input[type="email"]')).first()
    await expect(emailInput).toBeVisible({ timeout: 10000 })
    
    // Try multiple selectors for password input
    console.log('Looking for password input...')
    const passwordInput = page.locator('input[name="password"]').or(page.locator('input[type="password"]')).first()
    await expect(passwordInput).toBeVisible({ timeout: 10000 })
    
    // Fill in credentials
    console.log('Filling credentials...')
    await emailInput.fill(email)
    await passwordInput.fill(password)
    
    // Take screenshot before submit
    await page.screenshot({ path: 'test-results/auth-02-filled.png' })
    
    // Click sign in button
    console.log('Clicking submit...')
    const submitButton = page.locator('button[type="submit"]')
    await expect(submitButton).toBeVisible({ timeout: 5000 })
    await submitButton.click()
    
    // Wait for navigation or error
    console.log('Waiting for response...')
    await page.waitForLoadState('networkidle', { timeout: 30000 })
    
    // Take screenshot after submit
    await page.screenshot({ path: 'test-results/auth-03-after-submit.png' })
    console.log(`URL after submit: ${page.url()}`)
    
    // Check for error messages
    const errorMessage = page.locator('[role="alert"], .error, .text-red-500, .text-destructive').first()
    if (await errorMessage.isVisible({ timeout: 2000 }).catch(() => false)) {
      const errorText = await errorMessage.textContent()
      console.error(`Login error detected: ${errorText}`)
      throw new Error(`Login failed: ${errorText}`)
    }
    
    // Wait for successful redirect to dashboard
    console.log('Waiting for redirect to dashboard...')
    await page.waitForURL(/\/dashboard/, { timeout: 60000 })
    
    // Take screenshot after login
    await page.screenshot({ path: 'test-results/auth-04-success.png' })
    
    // Wait for page to stabilize
    await page.waitForLoadState('networkidle', { timeout: 30000 })
    
    console.log('Auth successful, saving state...')
    
    // Save signed-in state to reuse across tests
    await page.context().storageState({ path: authFile })
    
    // Verify file was created
    if (fs.existsSync(authFile)) {
      console.log(`Auth file created successfully: ${authFile}`)
    } else {
      throw new Error('Failed to create auth file')
    }
    
    console.log('=== AUTH SETUP COMPLETE ===')
  } catch (error) {
    // Take failure screenshot
    await page.screenshot({ path: 'test-results/auth-FAILURE.png' })
    console.error(`=== AUTH SETUP FAILED ===`)
    console.error(`Error: ${error}`)
    console.error(`Current URL: ${page.url()}`)
    
    // Log page content for debugging
    const content = await page.content()
    console.error(`Page content (first 1000 chars): ${content.substring(0, 1000)}`)
    
    // IMPORTANT: Save whatever state we have, even if auth failed
    // This prevents cascading ENOENT errors in dependent tests
    try {
      await page.context().storageState({ path: authFile })
      console.log('Saved unauthenticated state to prevent cascading failures')
    } catch (saveError) {
      console.error('Failed to save state:', saveError)
    }
    
    throw error
  }
})
