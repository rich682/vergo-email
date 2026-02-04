import { test, expect } from '../fixtures/test.fixture'

/**
 * Smoke Tests
 * 
 * Verify all major routes load without errors.
 * These tests run first to catch any broken pages early.
 */

test.describe('Smoke Tests', () => {
  test.describe('Dashboard Routes', () => {
    const routes = [
      { path: '/dashboard/tasks', name: 'Tasks' },
      { path: '/dashboard/boards', name: 'Boards' },
      { path: '/dashboard/requests', name: 'Requests' },
      { path: '/dashboard/collection', name: 'Collection' },
      { path: '/dashboard/contacts', name: 'Contacts' },
      { path: '/dashboard/reports', name: 'Reports' },
      { path: '/dashboard/forms', name: 'Forms' },
      { path: '/dashboard/databases', name: 'Databases' },
    ]

    for (const route of routes) {
      test(`${route.name} page loads without errors`, async ({ page, testErrors }) => {
        await page.goto(route.path)
        await page.waitForLoadState('networkidle')
        
        // Verify page rendered (not blank)
        await expect(page.locator('body')).not.toBeEmpty()
        
        // Verify we're not on an error page
        await expect(page.locator('h1:has-text("Error"), h1:has-text("404"), h1:has-text("500")')).not.toBeVisible()
      })
    }
  })

  test.describe('Settings Routes', () => {
    const routes = [
      { path: '/dashboard/settings', name: 'Settings' },
      { path: '/dashboard/settings/team', name: 'Team' },
      { path: '/dashboard/settings/accounting', name: 'Accounting Calendar' },
    ]

    for (const route of routes) {
      test(`${route.name} page loads without errors`, async ({ page, testErrors }) => {
        await page.goto(route.path)
        await page.waitForLoadState('networkidle')
        
        await expect(page.locator('body')).not.toBeEmpty()
        await expect(page.locator('h1:has-text("Error"), h1:has-text("404"), h1:has-text("500")')).not.toBeVisible()
      })
    }
  })

  test.describe('Navigation', () => {
    test('sidebar renders with all menu items', async ({ page, testErrors }) => {
      await page.goto('/dashboard/tasks')
      await page.waitForLoadState('networkidle')
      
      // Verify sidebar exists
      const sidebar = page.locator('[data-testid="sidebar"], nav, aside')
      await expect(sidebar).toBeVisible()
      
      // Check main nav items are present
      const expectedItems = ['Tasks', 'Boards', 'Requests', 'Contacts', 'Reports', 'Forms', 'Databases', 'Settings']
      
      for (const item of expectedItems) {
        await expect(page.locator(`text=${item}`).first()).toBeVisible()
      }
    })

    test('clicking nav items navigates correctly', async ({ page, testErrors }) => {
      await page.goto('/dashboard/tasks')
      await page.waitForLoadState('networkidle')
      
      // Click Contacts
      await page.click('a:has-text("Contacts"), button:has-text("Contacts")')
      await page.waitForLoadState('networkidle')
      
      await expect(page).toHaveURL(/\/dashboard\/contacts/)
      
      // Click Databases
      await page.click('a:has-text("Databases"), button:has-text("Databases")')
      await page.waitForLoadState('networkidle')
      
      await expect(page).toHaveURL(/\/dashboard\/databases/)
    })
  })

  test.describe('Authentication', () => {
    test('unauthenticated users are redirected to login', async ({ browser }) => {
      // Create a new context without auth
      const context = await browser.newContext()
      const page = await context.newPage()
      
      await page.goto('/dashboard/tasks')
      
      // Should redirect to sign in
      await expect(page).toHaveURL(/\/auth\/signin/)
      
      await context.close()
    })

    test('authenticated user stays logged in', async ({ page, testErrors }) => {
      await page.goto('/dashboard/tasks')
      await page.waitForLoadState('networkidle')
      
      // Should NOT redirect to sign in
      await expect(page).not.toHaveURL(/\/auth\/signin/)
      
      // Should be on dashboard
      await expect(page).toHaveURL(/\/dashboard/)
    })
  })

  test.describe('Error Handling', () => {
    test('404 page displays for unknown routes', async ({ page }) => {
      await page.goto('/dashboard/nonexistent-page-xyz')
      
      // Should show 404 or redirect to valid page
      const is404 = await page.locator('text=404, text=not found').isVisible()
      const redirectedToDashboard = page.url().includes('/dashboard/tasks') || page.url().includes('/dashboard/boards')
      
      expect(is404 || redirectedToDashboard).toBeTruthy()
    })
  })
})
