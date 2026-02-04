import { test as base, expect, Page } from '@playwright/test'
import * as fs from 'fs'

const authFile = 'playwright/.auth/user.json'

/**
 * Extended Test Fixture
 * 
 * Provides authenticated context and global error capture for all tests.
 * - Automatically uses saved auth state OR performs inline auth
 * - Fails tests on console errors
 * - Fails tests on uncaught page errors
 * - Fails tests on 5xx server responses
 */

// Track errors during test execution
interface TestErrors {
  consoleErrors: string[]
  pageErrors: string[]
  serverErrors: string[]
}

/**
 * Perform inline authentication if needed
 */
async function ensureAuthenticated(page: Page): Promise<void> {
  // Navigate to dashboard to check auth status
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 })
  
  // Check if we're on the sign in page (not authenticated)
  const currentUrl = page.url()
  if (currentUrl.includes('/auth/signin') || currentUrl.includes('/login')) {
    console.log('Not authenticated, performing inline login...')
    
    const email = process.env.TEST_USER_EMAIL
    const password = process.env.TEST_USER_PASSWORD
    
    if (!email || !password) {
      throw new Error('Missing TEST_USER_EMAIL or TEST_USER_PASSWORD environment variables')
    }
    
    // Fill login form
    await page.fill('input[name="email"], input[type="email"]', email)
    await page.fill('input[name="password"], input[type="password"]', password)
    await page.click('button[type="submit"]')
    
    // Wait for redirect to dashboard
    await page.waitForURL(/\/dashboard/, { timeout: 30000 })
    
    // Save auth state for subsequent tests
    const authDir = 'playwright/.auth'
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true })
    }
    await page.context().storageState({ path: authFile })
    console.log('Inline auth successful, state saved')
  }
}

// Extend the base test with error tracking and auto-auth
export const test = base.extend<{ testErrors: TestErrors }>({
  // Override the page fixture to ensure authentication
  page: async ({ page }, use) => {
    // Ensure we're authenticated before each test
    await ensureAuthenticated(page)
    await use(page)
  },
  
  testErrors: async ({ page }, use) => {
    const errors: TestErrors = {
      consoleErrors: [],
      pageErrors: [],
      serverErrors: [],
    }

    // Capture console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text()
        // Ignore some common non-critical errors
        if (
          !text.includes('Failed to load resource') && // Network errors handled separately
          !text.includes('favicon.ico') && // Favicon errors are non-critical
          !text.includes('hydration') // React hydration warnings
        ) {
          errors.consoleErrors.push(text)
        }
      }
    })

    // Capture page errors (uncaught exceptions)
    page.on('pageerror', (error) => {
      errors.pageErrors.push(error.message)
    })

    // Capture 5xx server errors
    page.on('response', (response) => {
      if (response.status() >= 500) {
        errors.serverErrors.push(
          `${response.status()} ${response.statusText()} on ${response.url()}`
        )
      }
    })

    // Run the test
    await use(errors)

    // After test: fail if any errors were captured
    const allErrors: string[] = []
    
    if (errors.consoleErrors.length > 0) {
      allErrors.push(`Console errors:\n  - ${errors.consoleErrors.join('\n  - ')}`)
    }
    
    if (errors.pageErrors.length > 0) {
      allErrors.push(`Page errors:\n  - ${errors.pageErrors.join('\n  - ')}`)
    }
    
    if (errors.serverErrors.length > 0) {
      allErrors.push(`Server errors:\n  - ${errors.serverErrors.join('\n  - ')}`)
    }
    
    if (allErrors.length > 0) {
      throw new Error(`Test failed due to errors:\n\n${allErrors.join('\n\n')}`)
    }
  },
})

// Re-export expect for convenience
export { expect }

/**
 * Helper to wait for page to be fully loaded
 */
export async function waitForPageReady(page: Page) {
  await page.waitForLoadState('networkidle')
}

/**
 * Helper to click and wait for navigation
 */
export async function clickAndWaitForNavigation(page: Page, selector: string) {
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.click(selector),
  ])
}

/**
 * Helper to fill form field with label
 */
export async function fillFieldByLabel(page: Page, label: string, value: string) {
  const field = page.locator(`label:has-text("${label}") + input, label:has-text("${label}") + textarea`)
  await field.fill(value)
}

/**
 * Helper to select option from dropdown
 */
export async function selectOption(page: Page, label: string, value: string) {
  await page.click(`label:has-text("${label}") + button, [aria-label="${label}"]`)
  await page.click(`[role="option"]:has-text("${value}")`)
}

/**
 * Helper to wait for toast message
 */
export async function waitForToast(page: Page, message: string) {
  await expect(page.locator(`text=${message}`)).toBeVisible({ timeout: 5000 })
}

/**
 * Helper to close modal if open
 */
export async function closeModalIfOpen(page: Page) {
  const closeButton = page.locator('[data-testid="modal-close"], button:has-text("Close"), button:has-text("Cancel")')
  if (await closeButton.isVisible()) {
    await closeButton.click()
  }
}
