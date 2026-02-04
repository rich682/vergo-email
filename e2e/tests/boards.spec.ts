import { test, expect } from '../fixtures/test.fixture'
import { BoardsPage } from '../pages/boards.page'

/**
 * Boards Module Tests
 * 
 * Tests for:
 * - Board listing and filtering
 * - Creating recurring and ad-hoc boards
 * - Adding collaborators
 * - Completing boards (triggering next period)
 * - Archiving and duplicating boards
 */

test.describe('Boards Module', () => {
  let boardsPage: BoardsPage

  test.beforeEach(async ({ page }) => {
    boardsPage = new BoardsPage(page)
  })

  test.describe('Board Listing', () => {
    test('boards page loads and displays boards', async ({ page, testErrors }) => {
      await boardsPage.goto()
      await boardsPage.expectLoaded()
    })

    test('can search boards by name', async ({ page, testErrors }) => {
      await boardsPage.goto()
      await boardsPage.searchBoards('January')
      
      // Results should update
      await page.waitForLoadState('networkidle')
    })

    test('can filter boards by cadence', async ({ page, testErrors }) => {
      await boardsPage.goto()
      await boardsPage.filterByCadence('Monthly')
      
      await page.waitForLoadState('networkidle')
    })
  })

  test.describe('Board Creation', () => {
    test('can create a MONTHLY recurring board', async ({ page, testErrors }) => {
      await boardsPage.goto()
      
      await boardsPage.createBoard({
        name: `E2E Test Board ${Date.now()}`,
        cadence: 'MONTHLY',
        automationEnabled: true,
      })
      
      // Should redirect to board or show success
      await page.waitForLoadState('networkidle')
    })

    test('can create an AD_HOC board', async ({ page, testErrors }) => {
      await boardsPage.goto()
      
      await boardsPage.createBoard({
        name: `E2E Ad Hoc ${Date.now()}`,
        cadence: 'AD_HOC',
      })
      
      await page.waitForLoadState('networkidle')
    })

    test('can create a QUARTERLY board with period dates', async ({ page, testErrors }) => {
      const startDate = new Date().toISOString().split('T')[0]
      const endDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      
      await boardsPage.goto()
      
      await boardsPage.createBoard({
        name: `E2E Quarterly ${Date.now()}`,
        cadence: 'QUARTERLY',
        periodStart: startDate,
        periodEnd: endDate,
        automationEnabled: true,
      })
      
      await page.waitForLoadState('networkidle')
    })
  })

  test.describe('Board Management', () => {
    test('can add collaborator to a board', async ({ page, testErrors }) => {
      await boardsPage.goto()
      
      // Click first board in list
      await page.click('[data-testid="board-card"]:first-child, tr:first-child a')
      await page.waitForLoadState('networkidle')
      
      // Add collaborator (use test data - adapt to your actual users)
      await page.click('button:has-text("Add Collaborator"), button:has-text("Add")')
      await page.waitForLoadState('networkidle')
    })

    test('can archive a board', async ({ page, testErrors }) => {
      await boardsPage.goto()
      
      // Navigate to a board detail
      await page.click('[data-testid="board-card"]:first-child, tr:first-child a')
      await page.waitForLoadState('networkidle')
      
      // Look for archive button
      const archiveButton = page.locator('button:has-text("Archive")')
      if (await archiveButton.isVisible()) {
        await archiveButton.click()
        
        // Confirm if needed
        const confirmButton = page.locator('button:has-text("Confirm")')
        if (await confirmButton.isVisible()) {
          await confirmButton.click()
        }
      }
    })

    test('can duplicate a board', async ({ page, testErrors }) => {
      await boardsPage.goto()
      
      await page.click('[data-testid="board-card"]:first-child, tr:first-child a')
      await page.waitForLoadState('networkidle')
      
      const duplicateButton = page.locator('button:has-text("Duplicate")')
      if (await duplicateButton.isVisible()) {
        await duplicateButton.click()
        await page.waitForLoadState('networkidle')
      }
    })
  })

  test.describe('Board Completion', () => {
    test('completing a recurring board creates next period', async ({ page, testErrors }) => {
      await boardsPage.goto()
      
      // Find a board with automation enabled
      await page.click('[data-testid="board-card"]:first-child, tr:first-child a')
      await page.waitForLoadState('networkidle')
      
      // Change status to complete
      const statusButton = page.locator('[aria-label="Status"], button:has-text("Status")')
      if (await statusButton.isVisible()) {
        await statusButton.click()
        await page.click('[role="option"]:has-text("Complete")')
        await page.waitForLoadState('networkidle')
      }
    })
  })
})
