import { Page, expect } from '@playwright/test'

/**
 * Databases Page Object Model
 * 
 * Handles interactions with the Databases module:
 * - List and search databases
 * - Create databases (manual and from Excel)
 * - Edit schema
 * - Import/export data
 * - Filter and search data
 */
export class DatabasesPage {
  constructor(private page: Page) {}

  // ========== Navigation ==========

  async goto() {
    await this.page.goto('/dashboard/databases')
    await this.page.waitForLoadState('networkidle')
  }

  async gotoDatabase(databaseId: string) {
    await this.page.goto(`/dashboard/databases/${databaseId}`)
    await this.page.waitForLoadState('networkidle')
  }

  async gotoNew() {
    await this.page.goto('/dashboard/databases/new')
    await this.page.waitForLoadState('networkidle')
  }

  async expectLoaded() {
    await expect(this.page.locator('h1:has-text("Databases"), h2:has-text("Databases")')).toBeVisible()
  }

  // ========== Database CRUD ==========

  async createDatabaseManually(options: {
    name: string
    description?: string
    columns: Array<{
      label: string
      type: 'text' | 'number' | 'date' | 'boolean' | 'currency'
      required?: boolean
    }>
  }) {
    await this.gotoNew()
    
    // Fill name
    await this.page.fill('input[name="name"]', options.name)
    
    if (options.description) {
      await this.page.fill('textarea[name="description"]', options.description)
    }
    
    // Add columns
    for (const column of options.columns) {
      await this.page.click('button:has-text("Add Column")')
      
      // Fill column details
      const lastColumnRow = this.page.locator('[data-testid="column-row"]').last()
      await lastColumnRow.locator('input[name="label"]').fill(column.label)
      
      // Select type
      await lastColumnRow.locator('[aria-label="Type"], button:has-text("Type")').click()
      await this.page.click(`[role="option"]:has-text("${column.type}")`)
      
      if (column.required) {
        await lastColumnRow.locator('[name="required"]').check()
      }
    }
    
    // Create
    await this.page.click('button:has-text("Create")')
    await this.page.waitForLoadState('networkidle')
  }

  async createDatabaseFromExcel(options: {
    name: string
    filePath: string
    importData?: boolean
  }) {
    await this.gotoNew()
    
    // Fill name
    await this.page.fill('input[name="name"]', options.name)
    
    // Click upload tab/button
    await this.page.click('button:has-text("Upload"), [role="tab"]:has-text("Upload")')
    
    // Upload file
    await this.page.setInputFiles('input[type="file"]', options.filePath)
    await this.page.waitForLoadState('networkidle')
    
    // Preview should appear
    await expect(this.page.locator('[data-testid="schema-preview"], table')).toBeVisible()
    
    // Toggle import data
    if (options.importData !== undefined) {
      const toggle = this.page.locator('[name="importData"]')
      const isChecked = await toggle.isChecked()
      if (isChecked !== options.importData) {
        await toggle.click()
      }
    }
    
    // Create
    await this.page.click('button:has-text("Create")')
    await this.page.waitForLoadState('networkidle')
  }

  async deleteDatabase(databaseName: string) {
    await this.goto()
    
    await this.page.click(`[data-testid="database-${databaseName}"] button:has-text("Delete"), tr:has-text("${databaseName}") button:has-text("Delete")`)
    
    // Confirm
    const confirmButton = this.page.locator('button:has-text("Confirm"), button:has-text("Delete")')
    if (await confirmButton.isVisible()) {
      await confirmButton.click()
    }
    
    await this.page.waitForLoadState('networkidle')
  }

  async expectDatabaseVisible(name: string) {
    await expect(this.page.locator(`text=${name}`)).toBeVisible()
  }

  async expectDatabaseNotVisible(name: string) {
    await expect(this.page.locator(`text=${name}`)).not.toBeVisible()
  }

  // ========== Database Detail Tabs ==========

  async switchToDataTab() {
    await this.page.click('button:has-text("Data"), [role="tab"]:has-text("Data")')
  }

  async switchToSchemaTab() {
    await this.page.click('button:has-text("Schema"), [role="tab"]:has-text("Schema")')
  }

  // ========== Schema Editing ==========

  async addColumn(options: {
    label: string
    type: 'text' | 'number' | 'date' | 'boolean' | 'currency'
    required?: boolean
  }) {
    await this.switchToSchemaTab()
    
    await this.page.click('button:has-text("Edit")')
    await this.page.click('button:has-text("Add Column")')
    
    const lastColumnRow = this.page.locator('[data-testid="column-row"]').last()
    await lastColumnRow.locator('input[name="label"]').fill(options.label)
    
    await lastColumnRow.locator('[aria-label="Type"]').click()
    await this.page.click(`[role="option"]:has-text("${options.type}")`)
    
    if (options.required) {
      await lastColumnRow.locator('[name="required"]').check()
    }
    
    await this.page.click('button:has-text("Save")')
    await this.page.waitForLoadState('networkidle')
  }

  async removeColumn(columnLabel: string) {
    await this.switchToSchemaTab()
    
    await this.page.click('button:has-text("Edit")')
    await this.page.click(`[data-testid="column-${columnLabel}"] button:has-text("Remove")`)
    await this.page.click('button:has-text("Save")')
    await this.page.waitForLoadState('networkidle')
  }

  // ========== Data Operations ==========

  async searchData(query: string) {
    await this.switchToDataTab()
    await this.page.fill('input[placeholder*="Search"]', query)
    await this.page.waitForLoadState('networkidle')
  }

  async filterByColumn(columnLabel: string, value: string) {
    await this.switchToDataTab()
    await this.page.click(`[data-testid="filter-${columnLabel}"], th:has-text("${columnLabel}") button`)
    await this.page.click(`[role="option"]:has-text("${value}")`)
    await this.page.waitForLoadState('networkidle')
  }

  async clearFilters() {
    await this.page.click('button:has-text("Clear")')
    await this.page.waitForLoadState('networkidle')
  }

  // ========== Import/Export ==========

  async importExcel(filePath: string, options?: { updateExisting?: boolean }) {
    await this.page.click('button:has-text("Import")')
    await expect(this.page.locator('[role="dialog"]')).toBeVisible()
    
    await this.page.setInputFiles('input[type="file"]', filePath)
    await this.page.waitForLoadState('networkidle')
    
    // Wait for preview
    await expect(this.page.locator('[data-testid="import-preview"]')).toBeVisible()
    
    // Toggle update existing if specified
    if (options?.updateExisting !== undefined) {
      const toggle = this.page.locator('[name="updateExisting"]')
      const isChecked = await toggle.isChecked()
      if (isChecked !== options.updateExisting) {
        await toggle.click()
      }
    }
    
    // Complete import
    await this.page.click('button:has-text("Import"), button:has-text("Confirm")')
    await this.page.waitForLoadState('networkidle')
  }

  async exportToExcel() {
    const downloadPromise = this.page.waitForEvent('download')
    await this.page.click('button:has-text("Export")')
    const download = await downloadPromise
    return download.path()
  }

  async downloadTemplate() {
    const downloadPromise = this.page.waitForEvent('download')
    await this.page.click('button:has-text("Template"), button:has-text("Download Template")')
    const download = await downloadPromise
    return download.path()
  }

  // ========== Assertions ==========

  async expectRowCount(count: number) {
    await expect(this.page.locator(`text=${count} rows, text=${count} row`)).toBeVisible()
  }

  async expectCellValue(rowIndex: number, columnLabel: string, value: string) {
    const row = this.page.locator('tbody tr').nth(rowIndex)
    await expect(row.locator(`td:has-text("${value}")`)).toBeVisible()
  }
}
