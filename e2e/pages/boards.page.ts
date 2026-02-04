import { Page, expect } from '@playwright/test'

/**
 * Boards Page Object Model
 * 
 * Handles interactions with the Boards module:
 * - List and filter boards
 * - Create boards (recurring and ad-hoc)
 * - Edit board settings
 * - Add collaborators
 * - Complete boards
 */
export class BoardsPage {
  constructor(private page: Page) {}

  // Navigation
  async goto() {
    await this.page.goto('/dashboard/boards')
    await this.page.waitForLoadState('networkidle')
  }

  // Verify page loaded
  async expectLoaded() {
    await expect(this.page.locator('h1:has-text("Boards"), h2:has-text("Boards")')).toBeVisible()
  }

  // Create new board
  async createBoard(options: {
    name?: string
    cadence: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEAR_END' | 'AD_HOC'
    periodStart?: string
    periodEnd?: string
    automationEnabled?: boolean
  }) {
    // Click create button
    await this.page.click('button:has-text("New Board"), button:has-text("Create")')
    
    // Wait for modal/form
    await expect(this.page.locator('[role="dialog"], form')).toBeVisible()
    
    // Fill in name if provided
    if (options.name) {
      await this.page.fill('input[name="name"]', options.name)
    }
    
    // Select cadence
    await this.page.click('button:has-text("Cadence"), [aria-label="Cadence"]')
    await this.page.click(`[role="option"]:has-text("${options.cadence}")`)
    
    // Set period dates if provided
    if (options.periodStart) {
      await this.page.fill('input[name="periodStart"]', options.periodStart)
    }
    if (options.periodEnd) {
      await this.page.fill('input[name="periodEnd"]', options.periodEnd)
    }
    
    // Toggle automation if specified
    if (options.automationEnabled !== undefined) {
      const toggle = this.page.locator('[name="automationEnabled"], [aria-label="Enable automation"]')
      const isChecked = await toggle.isChecked()
      if (isChecked !== options.automationEnabled) {
        await toggle.click()
      }
    }
    
    // Submit
    await this.page.click('button[type="submit"], button:has-text("Create")')
    
    // Wait for success
    await this.page.waitForLoadState('networkidle')
  }

  // Add collaborator to board
  async addCollaborator(boardName: string, collaboratorName: string) {
    // Click on board to open detail
    await this.page.click(`text=${boardName}`)
    await this.page.waitForLoadState('networkidle')
    
    // Click add collaborator button
    await this.page.click('button:has-text("Add Collaborator"), button:has-text("Add")')
    
    // Search and select collaborator
    await this.page.fill('input[placeholder*="Search"], input[name="search"]', collaboratorName)
    await this.page.click(`[role="option"]:has-text("${collaboratorName}")`)
    
    // Confirm
    await this.page.click('button:has-text("Add"), button:has-text("Save")')
  }

  // Complete a board
  async completeBoard(boardName: string) {
    // Navigate to board
    await this.page.click(`text=${boardName}`)
    await this.page.waitForLoadState('networkidle')
    
    // Change status to complete
    await this.page.click('[aria-label="Status"], button:has-text("Status")')
    await this.page.click('[role="option"]:has-text("Complete")')
    
    // Wait for confirmation or auto-save
    await this.page.waitForLoadState('networkidle')
  }

  // Archive a board
  async archiveBoard(boardName: string) {
    await this.page.click(`text=${boardName}`)
    await this.page.waitForLoadState('networkidle')
    
    await this.page.click('button:has-text("Archive")')
    
    // Confirm if dialog appears
    const confirmButton = this.page.locator('button:has-text("Confirm")')
    if (await confirmButton.isVisible()) {
      await confirmButton.click()
    }
  }

  // Duplicate a board
  async duplicateBoard(boardName: string) {
    await this.page.click(`text=${boardName}`)
    await this.page.waitForLoadState('networkidle')
    
    await this.page.click('button:has-text("Duplicate")')
    
    // Wait for duplication to complete
    await this.page.waitForLoadState('networkidle')
  }

  // Check if board exists in list
  async expectBoardVisible(boardName: string) {
    await expect(this.page.locator(`text=${boardName}`)).toBeVisible()
  }

  // Filter boards by cadence
  async filterByCadence(cadence: string) {
    await this.page.click('[aria-label="Filter by cadence"], button:has-text("Cadence")')
    await this.page.click(`[role="option"]:has-text("${cadence}")`)
  }

  // Search boards
  async searchBoards(query: string) {
    await this.page.fill('input[placeholder*="Search"]', query)
    await this.page.waitForLoadState('networkidle')
  }
}
