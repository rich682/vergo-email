import { Page, expect } from '@playwright/test'

/**
 * Reports Page Object Model
 * 
 * Handles interactions with the Reports module:
 * - List report templates
 * - Create report templates (standard and pivot)
 * - Configure report builder
 * - View generated reports
 * - Export reports
 */
export class ReportsPage {
  constructor(private page: Page) {}

  // ========== Navigation ==========

  async goto() {
    await this.page.goto('/dashboard/reports')
    await this.page.waitForLoadState('networkidle')
  }

  async gotoReport(reportId: string) {
    await this.page.goto(`/dashboard/reports/${reportId}`)
    await this.page.waitForLoadState('networkidle')
  }

  async gotoNew() {
    await this.page.goto('/dashboard/reports/new')
    await this.page.waitForLoadState('networkidle')
  }

  async expectLoaded() {
    await expect(this.page.locator('h1:has-text("Reports"), h2:has-text("Reports")')).toBeVisible()
  }

  // ========== Template CRUD ==========

  async createTemplate(options: {
    name: string
    description?: string
    cadence: 'DAILY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'
    databaseName: string
    dateColumn: string
    layout: 'STANDARD' | 'PIVOT'
  }) {
    await this.gotoNew()
    
    // Basic info
    await this.page.fill('input[name="name"]', options.name)
    
    if (options.description) {
      await this.page.fill('textarea[name="description"]', options.description)
    }
    
    // Select cadence
    await this.page.click('[aria-label="Cadence"], button:has-text("Cadence")')
    await this.page.click(`[role="option"]:has-text("${options.cadence}")`)
    
    // Select database
    await this.page.click('[aria-label="Database"], button:has-text("Database")')
    await this.page.click(`[role="option"]:has-text("${options.databaseName}")`)
    
    // Select date column
    await this.page.click('[aria-label="Date Column"], button:has-text("Date")')
    await this.page.click(`[role="option"]:has-text("${options.dateColumn}")`)
    
    // Select layout
    await this.page.click(`[data-testid="layout-${options.layout}"], button:has-text("${options.layout}")`)
    
    // Create
    await this.page.click('button:has-text("Create")')
    await this.page.waitForLoadState('networkidle')
  }

  async deleteTemplate(templateName: string) {
    await this.goto()
    
    await this.page.click(`[data-testid="template-${templateName}"] button:has-text("Delete")`)
    
    // Confirm
    const confirmButton = this.page.locator('button:has-text("Confirm")')
    if (await confirmButton.isVisible()) {
      await confirmButton.click()
    }
    
    await this.page.waitForLoadState('networkidle')
  }

  async expectTemplateVisible(name: string) {
    await expect(this.page.locator(`text=${name}`)).toBeVisible()
  }

  // ========== Report Builder ==========

  async toggleSourceColumn(columnLabel: string) {
    await this.page.click(`[data-testid="column-${columnLabel}"] input[type="checkbox"], label:has-text("${columnLabel}")`)
  }

  async addFormulaColumn(options: {
    label: string
    formula: string
  }) {
    await this.page.click('button:has-text("Add Formula Column")')
    
    const lastRow = this.page.locator('[data-testid="formula-column"]').last()
    await lastRow.locator('input[name="label"]').fill(options.label)
    await lastRow.locator('input[name="formula"]').fill(options.formula)
  }

  async addFormulaRow(options: {
    label: string
    aggregation: 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX'
    column: string
  }) {
    await this.page.click('button:has-text("Add Formula Row")')
    
    const lastRow = this.page.locator('[data-testid="formula-row"]').last()
    await lastRow.locator('input[name="label"]').fill(options.label)
    
    await lastRow.locator('[aria-label="Aggregation"]').click()
    await this.page.click(`[role="option"]:has-text("${options.aggregation}")`)
    
    await lastRow.locator('[aria-label="Column"]').click()
    await this.page.click(`[role="option"]:has-text("${options.column}")`)
  }

  async setComparison(mode: 'MoM' | 'YoY' | 'QoQ' | 'none') {
    await this.page.click('[aria-label="Comparison"], button:has-text("Comparison")')
    await this.page.click(`[role="option"]:has-text("${mode}")`)
  }

  async addFilterColumn(columnLabel: string) {
    await this.page.click('button:has-text("Add Filter")')
    await this.page.click(`[role="option"]:has-text("${columnLabel}")`)
  }

  async saveReport() {
    await this.page.click('button:has-text("Save")')
    await this.page.waitForLoadState('networkidle')
  }

  // ========== Report Preview ==========

  async selectPreviewPeriod(period: string) {
    await this.page.click('[aria-label="Period"], button:has-text("Period")')
    await this.page.click(`[role="option"]:has-text("${period}")`)
    await this.page.waitForLoadState('networkidle')
  }

  async expectPreviewLoaded() {
    await expect(this.page.locator('[data-testid="report-preview"], table')).toBeVisible()
  }

  // ========== Generated Reports ==========

  async filterGeneratedByTemplate(templateName: string) {
    await this.page.click('[aria-label="Filter by template"]')
    await this.page.click(`[role="option"]:has-text("${templateName}")`)
    await this.page.waitForLoadState('networkidle')
  }

  async filterGeneratedByPeriod(period: string) {
    await this.page.click('[aria-label="Filter by period"]')
    await this.page.click(`[role="option"]:has-text("${period}")`)
    await this.page.waitForLoadState('networkidle')
  }

  async openReportViewer(reportIndex: number = 0) {
    await this.page.click(`[data-testid="generated-report"]:nth-child(${reportIndex + 1}) button:has-text("View")`)
    await expect(this.page.locator('[role="dialog"]')).toBeVisible()
  }

  async exportReport(reportIndex: number = 0) {
    const downloadPromise = this.page.waitForEvent('download')
    await this.page.click(`[data-testid="generated-report"]:nth-child(${reportIndex + 1}) button:has-text("Export")`)
    const download = await downloadPromise
    return download.path()
  }

  // ========== AI Insights ==========

  async expandInsightsPanel() {
    await this.page.click('[data-testid="insights-toggle"], button:has-text("Insights")')
  }

  async expectInsightsVisible() {
    await expect(this.page.locator('[data-testid="insights-panel"]')).toBeVisible()
  }

  async copyInsightsToClipboard() {
    await this.page.click('[data-testid="copy-insights"], button:has-text("Copy")')
  }
}
