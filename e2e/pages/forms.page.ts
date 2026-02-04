import { Page, expect } from '@playwright/test'

/**
 * Forms Page Object Model
 * 
 * Handles interactions with the Forms module:
 * - List and search forms
 * - Create forms via wizard
 * - Build forms (add/edit/delete fields)
 * - Preview forms
 * - Fill out forms
 */
export class FormsPage {
  constructor(private page: Page) {}

  // ========== Navigation ==========

  async goto() {
    await this.page.goto('/dashboard/forms')
    await this.page.waitForLoadState('networkidle')
  }

  async gotoForm(formId: string) {
    await this.page.goto(`/dashboard/forms/${formId}`)
    await this.page.waitForLoadState('networkidle')
  }

  async gotoNew() {
    await this.page.goto('/dashboard/forms/new')
    await this.page.waitForLoadState('networkidle')
  }

  async gotoFillForm(requestId: string) {
    await this.page.goto(`/forms/${requestId}`)
    await this.page.waitForLoadState('networkidle')
  }

  async expectLoaded() {
    await expect(this.page.locator('h1:has-text("Forms"), h2:has-text("Forms")')).toBeVisible()
  }

  // ========== Form CRUD ==========

  async createForm(options: {
    name: string
    description?: string
    databaseName?: string
  }) {
    await this.gotoNew()
    
    // Step 1: Name
    await this.page.fill('input[name="name"]', options.name)
    
    if (options.description) {
      await this.page.fill('textarea[name="description"]', options.description)
    }
    
    await this.page.click('button:has-text("Next")')
    
    // Step 2: Database (optional)
    if (options.databaseName) {
      await this.page.click('[aria-label="Database"], button:has-text("Database")')
      await this.page.click(`[role="option"]:has-text("${options.databaseName}")`)
    }
    
    await this.page.click('button:has-text("Create"), button:has-text("Next")')
    await this.page.waitForLoadState('networkidle')
  }

  async deleteForm(formName: string) {
    await this.goto()
    
    await this.page.click(`[data-testid="form-${formName}"] button:has-text("Delete"), tr:has-text("${formName}") button:has-text("Delete")`)
    
    // Confirm
    const confirmButton = this.page.locator('button:has-text("Confirm"), button:has-text("Delete")')
    if (await confirmButton.isVisible()) {
      await confirmButton.click()
    }
    
    await this.page.waitForLoadState('networkidle')
  }

  async expectFormVisible(name: string) {
    await expect(this.page.locator(`text=${name}`)).toBeVisible()
  }

  async expectFormNotVisible(name: string) {
    await expect(this.page.locator(`text=${name}`)).not.toBeVisible()
  }

  // ========== Form Builder ==========

  async addField(options: {
    type: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'checkbox'
    label: string
    required?: boolean
    options?: string[] // For select type
  }) {
    await this.page.click('button:has-text("Add Field")')
    
    // Select type
    await this.page.click('[aria-label="Field Type"], button:has-text("Type")')
    await this.page.click(`[role="option"]:has-text("${options.type}")`)
    
    // Fill label
    await this.page.fill('input[name="label"]', options.label)
    
    // Set required
    if (options.required) {
      await this.page.check('[name="required"]')
    }
    
    // Add options for select type
    if (options.type === 'select' && options.options) {
      for (const opt of options.options) {
        await this.page.click('button:has-text("Add Option")')
        await this.page.locator('input[name="option"]').last().fill(opt)
      }
    }
    
    await this.page.click('button:has-text("Save"), button:has-text("Add")')
    await this.page.waitForLoadState('networkidle')
  }

  async editField(currentLabel: string, updates: {
    label?: string
    required?: boolean
  }) {
    await this.page.click(`[data-testid="field-${currentLabel}"] button:has-text("Edit")`)
    
    if (updates.label) {
      await this.page.fill('input[name="label"]', updates.label)
    }
    
    if (updates.required !== undefined) {
      const checkbox = this.page.locator('[name="required"]')
      const isChecked = await checkbox.isChecked()
      if (isChecked !== updates.required) {
        await checkbox.click()
      }
    }
    
    await this.page.click('button:has-text("Save")')
    await this.page.waitForLoadState('networkidle')
  }

  async deleteField(label: string) {
    await this.page.click(`[data-testid="field-${label}"] button:has-text("Delete")`)
    
    // Confirm if dialog appears
    const confirmButton = this.page.locator('button:has-text("Confirm")')
    if (await confirmButton.isVisible()) {
      await confirmButton.click()
    }
    
    await this.page.waitForLoadState('networkidle')
  }

  async reorderField(label: string, direction: 'up' | 'down') {
    await this.page.click(`[data-testid="field-${label}"] button:has-text("${direction === 'up' ? '↑' : '↓'}"), [data-testid="field-${label}"] [aria-label="${direction}"]`)
    await this.page.waitForLoadState('networkidle')
  }

  async expectFieldVisible(label: string) {
    await expect(this.page.locator(`[data-testid="field-${label}"], text=${label}`)).toBeVisible()
  }

  async expectFieldNotVisible(label: string) {
    await expect(this.page.locator(`[data-testid="field-${label}"]`)).not.toBeVisible()
  }

  // ========== Form Preview ==========

  async openPreview() {
    await this.page.click('button:has-text("Preview")')
    await expect(this.page.locator('[data-testid="form-preview"]')).toBeVisible()
  }

  async closePreview() {
    await this.page.click('button:has-text("Close")')
  }

  // ========== Form Filling ==========

  async fillTextField(label: string, value: string) {
    await this.page.fill(`label:has-text("${label}") + input, [aria-label="${label}"]`, value)
  }

  async fillTextArea(label: string, value: string) {
    await this.page.fill(`label:has-text("${label}") + textarea`, value)
  }

  async fillNumberField(label: string, value: number) {
    await this.page.fill(`label:has-text("${label}") + input[type="number"]`, value.toString())
  }

  async fillDateField(label: string, value: string) {
    await this.page.fill(`label:has-text("${label}") + input[type="date"]`, value)
  }

  async selectOption(label: string, option: string) {
    await this.page.click(`label:has-text("${label}") + button, [aria-label="${label}"]`)
    await this.page.click(`[role="option"]:has-text("${option}")`)
  }

  async checkCheckbox(label: string) {
    await this.page.check(`label:has-text("${label}") input[type="checkbox"]`)
  }

  async uncheckCheckbox(label: string) {
    await this.page.uncheck(`label:has-text("${label}") input[type="checkbox"]`)
  }

  async submitForm() {
    await this.page.click('button:has-text("Submit")')
    await this.page.waitForLoadState('networkidle')
  }

  async expectSubmissionSuccess() {
    await expect(this.page.locator('text=submitted, text=success, text=Thank you')).toBeVisible()
  }

  async expectValidationError(fieldLabel: string) {
    await expect(this.page.locator(`text=${fieldLabel}`).locator('..').locator('text=required, text=invalid')).toBeVisible()
  }

  async expectAlreadySubmitted() {
    await expect(this.page.locator('text=already submitted, text=completed')).toBeVisible()
  }
}
