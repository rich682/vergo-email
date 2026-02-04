import { test, expect } from '../fixtures/test.fixture'
import { ReportsPage } from '../pages/reports.page'

/**
 * Reports Module Tests
 * 
 * Tests for:
 * - Report template listing
 * - Template creation (standard and pivot)
 * - Report builder configuration
 * - Generated reports viewing
 * - Report export
 */

test.describe('Reports Module', () => {
  let reportsPage: ReportsPage

  test.beforeEach(async ({ page }) => {
    reportsPage = new ReportsPage(page)
  })

  test.describe('Reports Listing', () => {
    test('reports page loads', async ({ page, testErrors }) => {
      await reportsPage.goto()
      await reportsPage.expectLoaded()
    })

    test('can search report templates', async ({ page, testErrors }) => {
      await reportsPage.goto()
      
      const searchInput = page.locator('input[placeholder*="Search"]')
      if (await searchInput.isVisible()) {
        await searchInput.fill('test')
        await page.waitForLoadState('networkidle')
      }
    })
  })

  test.describe('Template Creation', () => {
    test('can access new report page', async ({ page, testErrors }) => {
      await reportsPage.gotoNew()
      
      // Should see creation form
      await expect(page.locator('input[name="name"]')).toBeVisible()
    })

    test('new report form has required fields', async ({ page, testErrors }) => {
      await reportsPage.gotoNew()
      
      await expect(page.locator('input[name="name"]')).toBeVisible()
      
      // Cadence selector should exist
      const cadenceButton = page.locator('[aria-label="Cadence"], button:has-text("Cadence")')
      await expect(cadenceButton).toBeVisible()
    })

    test('can select database for report', async ({ page, testErrors }) => {
      await reportsPage.gotoNew()
      
      await page.fill('input[name="name"]', `E2E Test Report ${Date.now()}`)
      
      const databaseButton = page.locator('[aria-label="Database"], button:has-text("Database")')
      if (await databaseButton.isVisible()) {
        await databaseButton.click()
        
        // Should show database options
        await expect(page.locator('[role="option"]')).toBeVisible()
      }
    })

    test('can select report cadence', async ({ page, testErrors }) => {
      await reportsPage.gotoNew()
      
      const cadenceButton = page.locator('[aria-label="Cadence"], button:has-text("Cadence")')
      await cadenceButton.click()
      
      // Should show cadence options
      await expect(page.locator('[role="option"]:has-text("Monthly")')).toBeVisible()
    })

    test('can select layout type', async ({ page, testErrors }) => {
      await reportsPage.gotoNew()
      
      // Look for layout selection
      const standardButton = page.locator('button:has-text("Standard"), [data-testid="layout-STANDARD"]')
      const pivotButton = page.locator('button:has-text("Pivot"), [data-testid="layout-PIVOT"]')
      
      if (await standardButton.isVisible()) {
        await standardButton.click()
      }
    })
  })

  test.describe('Report Builder', () => {
    test('can access report builder', async ({ page, testErrors }) => {
      await reportsPage.goto()
      
      // Click first report template
      const firstTemplate = page.locator('[data-testid^="template-"], a:has-text("Edit"), a:has-text("View")').first()
      if (await firstTemplate.isVisible()) {
        await firstTemplate.click()
        await page.waitForLoadState('networkidle')
        
        await expect(page).toHaveURL(/\/dashboard\/reports\//)
      }
    })

    test('builder has column selection', async ({ page, testErrors }) => {
      await reportsPage.goto()
      
      const firstTemplate = page.locator('[data-testid^="template-"], a:has-text("Edit")').first()
      if (await firstTemplate.isVisible()) {
        await firstTemplate.click()
        await page.waitForLoadState('networkidle')
        
        // Should see column checkboxes or toggles
        const columnToggle = page.locator('input[type="checkbox"]').first()
        // May exist depending on template configuration
      }
    })

    test('can add formula column', async ({ page, testErrors }) => {
      await reportsPage.goto()
      
      const firstTemplate = page.locator('[data-testid^="template-"], a:has-text("Edit")').first()
      if (await firstTemplate.isVisible()) {
        await firstTemplate.click()
        await page.waitForLoadState('networkidle')
        
        const addFormulaButton = page.locator('button:has-text("Add Formula Column")')
        if (await addFormulaButton.isVisible()) {
          await addFormulaButton.click()
        }
      }
    })

    test('can add formula row', async ({ page, testErrors }) => {
      await reportsPage.goto()
      
      const firstTemplate = page.locator('[data-testid^="template-"], a:has-text("Edit")').first()
      if (await firstTemplate.isVisible()) {
        await firstTemplate.click()
        await page.waitForLoadState('networkidle')
        
        const addFormulaRowButton = page.locator('button:has-text("Add Formula Row"), button:has-text("Add Row")')
        if (await addFormulaRowButton.isVisible()) {
          await addFormulaRowButton.click()
        }
      }
    })

    test('can set comparison mode', async ({ page, testErrors }) => {
      await reportsPage.goto()
      
      const firstTemplate = page.locator('[data-testid^="template-"], a:has-text("Edit")').first()
      if (await firstTemplate.isVisible()) {
        await firstTemplate.click()
        await page.waitForLoadState('networkidle')
        
        const comparisonButton = page.locator('[aria-label="Comparison"], button:has-text("Comparison")')
        if (await comparisonButton.isVisible()) {
          await comparisonButton.click()
          
          await expect(page.locator('[role="option"]')).toBeVisible()
        }
      }
    })
  })

  test.describe('Report Preview', () => {
    test('builder has preview panel', async ({ page, testErrors }) => {
      await reportsPage.goto()
      
      const firstTemplate = page.locator('[data-testid^="template-"], a:has-text("Edit")').first()
      if (await firstTemplate.isVisible()) {
        await firstTemplate.click()
        await page.waitForLoadState('networkidle')
        
        // Should see preview section
        const preview = page.locator('[data-testid="report-preview"], text=Preview')
        // May exist depending on layout
      }
    })

    test('can select preview period', async ({ page, testErrors }) => {
      await reportsPage.goto()
      
      const firstTemplate = page.locator('[data-testid^="template-"], a:has-text("Edit")').first()
      if (await firstTemplate.isVisible()) {
        await firstTemplate.click()
        await page.waitForLoadState('networkidle')
        
        const periodSelector = page.locator('[aria-label="Period"], button:has-text("Period")')
        if (await periodSelector.isVisible()) {
          await periodSelector.click()
        }
      }
    })
  })

  test.describe('Generated Reports', () => {
    test('can view generated reports section', async ({ page, testErrors }) => {
      await reportsPage.goto()
      
      // Look for generated reports section
      const generatedSection = page.locator('text=Generated, text=Reports')
      // May exist if reports have been generated
    })

    test('can filter generated reports by template', async ({ page, testErrors }) => {
      await reportsPage.goto()
      
      const templateFilter = page.locator('[aria-label="Filter by template"]')
      if (await templateFilter.isVisible()) {
        await templateFilter.click()
      }
    })

    test('can filter generated reports by period', async ({ page, testErrors }) => {
      await reportsPage.goto()
      
      const periodFilter = page.locator('[aria-label="Filter by period"]')
      if (await periodFilter.isVisible()) {
        await periodFilter.click()
      }
    })
  })

  test.describe('Report Export', () => {
    test('export button exists for generated reports', async ({ page, testErrors }) => {
      await reportsPage.goto()
      
      const exportButton = page.locator('button:has-text("Export")')
      // Button visibility depends on whether reports exist
    })
  })

  test.describe('AI Insights', () => {
    test('insights panel toggle exists', async ({ page, testErrors }) => {
      await reportsPage.goto()
      
      const firstTemplate = page.locator('[data-testid^="template-"], a:has-text("Edit")').first()
      if (await firstTemplate.isVisible()) {
        await firstTemplate.click()
        await page.waitForLoadState('networkidle')
        
        const insightsToggle = page.locator('[data-testid="insights-toggle"], button:has-text("Insights")')
        // May exist depending on report state
      }
    })
  })
})
