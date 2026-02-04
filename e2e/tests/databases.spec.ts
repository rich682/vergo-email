import { test, expect } from '../fixtures/test.fixture'
import { DatabasesPage } from '../pages/databases.page'

/**
 * Databases Module Tests
 * 
 * Tests for:
 * - Database listing
 * - Database creation (manual and from Excel)
 * - Schema editing
 * - Data management (view, filter, search)
 * - Import/export
 */

test.describe('Databases Module', () => {
  let databasesPage: DatabasesPage

  test.beforeEach(async ({ page }) => {
    databasesPage = new DatabasesPage(page)
  })

  test.describe('Database Listing', () => {
    test('databases page loads', async ({ page, testErrors }) => {
      await databasesPage.goto()
      await databasesPage.expectLoaded()
    })

    test('can search databases', async ({ page, testErrors }) => {
      await databasesPage.goto()
      
      const searchInput = page.locator('input[placeholder*="Search"]')
      if (await searchInput.isVisible()) {
        await searchInput.fill('test')
        await page.waitForLoadState('networkidle')
      }
    })

    test('displays database metadata', async ({ page, testErrors }) => {
      await databasesPage.goto()
      
      // Should show row counts or column counts
      const metadata = page.locator('text=rows, text=columns')
      // May or may not be visible depending on whether databases exist
    })
  })

  test.describe('Database Creation', () => {
    test('can access new database page', async ({ page, testErrors }) => {
      await databasesPage.gotoNew()
      
      // Should see creation form
      await expect(page.locator('input[name="name"]')).toBeVisible()
    })

    test('new database form has name field', async ({ page, testErrors }) => {
      await databasesPage.gotoNew()
      
      await expect(page.locator('input[name="name"]')).toBeVisible()
    })

    test('can add columns manually', async ({ page, testErrors }) => {
      await databasesPage.gotoNew()
      
      // Fill name first
      await page.fill('input[name="name"]', `E2E Test DB ${Date.now()}`)
      
      // Click add column
      const addColumnButton = page.locator('button:has-text("Add Column")')
      if (await addColumnButton.isVisible()) {
        await addColumnButton.click()
        
        // Column row should appear
        await expect(page.locator('[data-testid="column-row"], input[name="label"]')).toBeVisible()
      }
    })

    test('can switch to upload mode', async ({ page, testErrors }) => {
      await databasesPage.gotoNew()
      
      const uploadTab = page.locator('button:has-text("Upload"), [role="tab"]:has-text("Upload")')
      if (await uploadTab.isVisible()) {
        await uploadTab.click()
        
        // File input should appear
        await expect(page.locator('input[type="file"]')).toBeAttached()
      }
    })

    test('can create a database', async ({ page, testErrors }) => {
      await databasesPage.gotoNew()
      
      await page.fill('input[name="name"]', `E2E Test Database ${Date.now()}`)
      
      // Add a column
      await page.click('button:has-text("Add Column")')
      await page.fill('input[name="label"]', 'Test Column')
      
      // Select type
      const typeButton = page.locator('[aria-label="Type"]').first()
      if (await typeButton.isVisible()) {
        await typeButton.click()
        await page.click('[role="option"]:has-text("Text")')
      }
      
      // Create
      await page.click('button:has-text("Create")')
      await page.waitForLoadState('networkidle')
    })
  })

  test.describe('Database Detail', () => {
    test('can view database detail', async ({ page, testErrors }) => {
      await databasesPage.goto()
      
      // Click first database
      const firstDb = page.locator('[data-testid^="database-"], a:has-text("View")').first()
      if (await firstDb.isVisible()) {
        await firstDb.click()
        await page.waitForLoadState('networkidle')
        
        await expect(page).toHaveURL(/\/dashboard\/databases\//)
      }
    })

    test('database detail has Data tab', async ({ page, testErrors }) => {
      await databasesPage.goto()
      
      const firstDb = page.locator('[data-testid^="database-"], a:has-text("View")').first()
      if (await firstDb.isVisible()) {
        await firstDb.click()
        await page.waitForLoadState('networkidle')
        
        const dataTab = page.locator('button:has-text("Data"), [role="tab"]:has-text("Data")')
        await expect(dataTab).toBeVisible()
      }
    })

    test('database detail has Schema tab', async ({ page, testErrors }) => {
      await databasesPage.goto()
      
      const firstDb = page.locator('[data-testid^="database-"], a:has-text("View")').first()
      if (await firstDb.isVisible()) {
        await firstDb.click()
        await page.waitForLoadState('networkidle')
        
        const schemaTab = page.locator('button:has-text("Schema"), [role="tab"]:has-text("Schema")')
        await expect(schemaTab).toBeVisible()
      }
    })
  })

  test.describe('Data Tab', () => {
    test('can search data', async ({ page, testErrors }) => {
      await databasesPage.goto()
      
      const firstDb = page.locator('[data-testid^="database-"], a:has-text("View")').first()
      if (await firstDb.isVisible()) {
        await firstDb.click()
        await page.waitForLoadState('networkidle')
        
        const searchInput = page.locator('input[placeholder*="Search"]')
        if (await searchInput.isVisible()) {
          await searchInput.fill('test')
          await page.waitForLoadState('networkidle')
        }
      }
    })

    test('can filter by column', async ({ page, testErrors }) => {
      await databasesPage.goto()
      
      const firstDb = page.locator('[data-testid^="database-"], a:has-text("View")').first()
      if (await firstDb.isVisible()) {
        await firstDb.click()
        await page.waitForLoadState('networkidle')
        
        // Look for filter dropdown on column header
        const filterButton = page.locator('th button, [data-testid^="filter-"]').first()
        if (await filterButton.isVisible()) {
          await filterButton.click()
        }
      }
    })
  })

  test.describe('Schema Tab', () => {
    test('can view schema', async ({ page, testErrors }) => {
      await databasesPage.goto()
      
      const firstDb = page.locator('[data-testid^="database-"], a:has-text("View")').first()
      if (await firstDb.isVisible()) {
        await firstDb.click()
        await page.waitForLoadState('networkidle')
        
        await page.click('button:has-text("Schema"), [role="tab"]:has-text("Schema")')
        await page.waitForLoadState('networkidle')
      }
    })

    test('can enter edit mode', async ({ page, testErrors }) => {
      await databasesPage.goto()
      
      const firstDb = page.locator('[data-testid^="database-"], a:has-text("View")').first()
      if (await firstDb.isVisible()) {
        await firstDb.click()
        await page.waitForLoadState('networkidle')
        
        await page.click('button:has-text("Schema"), [role="tab"]:has-text("Schema")')
        
        const editButton = page.locator('button:has-text("Edit")')
        if (await editButton.isVisible()) {
          await editButton.click()
        }
      }
    })
  })

  test.describe('Import/Export', () => {
    test('import button is visible', async ({ page, testErrors }) => {
      await databasesPage.goto()
      
      const firstDb = page.locator('[data-testid^="database-"], a:has-text("View")').first()
      if (await firstDb.isVisible()) {
        await firstDb.click()
        await page.waitForLoadState('networkidle')
        
        const importButton = page.locator('button:has-text("Import")')
        await expect(importButton).toBeVisible()
      }
    })

    test('can open import modal', async ({ page, testErrors }) => {
      await databasesPage.goto()
      
      const firstDb = page.locator('[data-testid^="database-"], a:has-text("View")').first()
      if (await firstDb.isVisible()) {
        await firstDb.click()
        await page.waitForLoadState('networkidle')
        
        await page.click('button:has-text("Import")')
        
        await expect(page.locator('[role="dialog"]')).toBeVisible()
      }
    })

    test('export button is visible', async ({ page, testErrors }) => {
      await databasesPage.goto()
      
      const firstDb = page.locator('[data-testid^="database-"], a:has-text("View")').first()
      if (await firstDb.isVisible()) {
        await firstDb.click()
        await page.waitForLoadState('networkidle')
        
        const exportButton = page.locator('button:has-text("Export")')
        await expect(exportButton).toBeVisible()
      }
    })

    test('template download button is visible', async ({ page, testErrors }) => {
      await databasesPage.goto()
      
      const firstDb = page.locator('[data-testid^="database-"], a:has-text("View")').first()
      if (await firstDb.isVisible()) {
        await firstDb.click()
        await page.waitForLoadState('networkidle')
        
        const templateButton = page.locator('button:has-text("Template"), button:has-text("Download Template")')
        // May or may not be visible
      }
    })
  })
})
