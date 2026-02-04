import { Page, expect } from '@playwright/test'

/**
 * Contacts Page Object Model
 * 
 * Handles interactions with the Contacts module:
 * - List and search contacts
 * - Create, edit, delete contacts
 * - Manage groups/tags
 * - Import contacts from Excel
 */
export class ContactsPage {
  constructor(private page: Page) {}

  // ========== Navigation ==========

  async goto() {
    await this.page.goto('/dashboard/contacts')
    await this.page.waitForLoadState('networkidle')
  }

  async expectLoaded() {
    await expect(this.page.locator('h1:has-text("Contacts"), h2:has-text("Contacts")')).toBeVisible()
  }

  // ========== Tabs ==========

  async switchToContactsTab() {
    await this.page.click('button:has-text("Contacts"), [role="tab"]:has-text("Contacts")')
  }

  async switchToTagsTab() {
    await this.page.click('button:has-text("Tags"), [role="tab"]:has-text("Tags")')
  }

  // ========== Contact CRUD ==========

  async createContact(options: {
    firstName: string
    email: string
    phone?: string
    contactType?: 'EMPLOYEE' | 'VENDOR' | 'CLIENT' | 'PARTNER' | 'OTHER'
    isInternal?: boolean
  }) {
    await this.page.click('button:has-text("Add Contact"), button:has-text("New")')
    await expect(this.page.locator('[role="dialog"], form')).toBeVisible()
    
    await this.page.fill('input[name="firstName"]', options.firstName)
    await this.page.fill('input[name="email"]', options.email)
    
    if (options.phone) {
      await this.page.fill('input[name="phone"]', options.phone)
    }
    
    if (options.contactType) {
      await this.page.click('[aria-label="Contact Type"], button:has-text("Type")')
      await this.page.click(`[role="option"]:has-text("${options.contactType}")`)
    }
    
    if (options.isInternal !== undefined) {
      const toggle = this.page.locator('[name="isInternal"]')
      const isChecked = await toggle.isChecked()
      if (isChecked !== options.isInternal) {
        await toggle.click()
      }
    }
    
    await this.page.click('button[type="submit"], button:has-text("Save")')
    await this.page.waitForLoadState('networkidle')
  }

  async editContact(email: string, updates: Partial<{
    firstName: string
    phone: string
    contactType: string
  }>) {
    // Click edit on the contact row
    await this.page.click(`tr:has-text("${email}") button:has-text("Edit"), [data-testid="contact-${email}"] button:has-text("Edit")`)
    await expect(this.page.locator('[role="dialog"], form')).toBeVisible()
    
    if (updates.firstName) {
      await this.page.fill('input[name="firstName"]', updates.firstName)
    }
    if (updates.phone) {
      await this.page.fill('input[name="phone"]', updates.phone)
    }
    if (updates.contactType) {
      await this.page.click('[aria-label="Contact Type"]')
      await this.page.click(`[role="option"]:has-text("${updates.contactType}")`)
    }
    
    await this.page.click('button:has-text("Save")')
    await this.page.waitForLoadState('networkidle')
  }

  async deleteContact(email: string) {
    await this.page.click(`tr:has-text("${email}") button:has-text("Delete"), [data-testid="contact-${email}"] button:has-text("Delete")`)
    
    // Confirm deletion
    const confirmButton = this.page.locator('button:has-text("Confirm"), button:has-text("Delete")')
    if (await confirmButton.isVisible()) {
      await confirmButton.click()
    }
    
    await this.page.waitForLoadState('networkidle')
  }

  async expectContactVisible(email: string) {
    await expect(this.page.locator(`text=${email}`)).toBeVisible()
  }

  async expectContactNotVisible(email: string) {
    await expect(this.page.locator(`text=${email}`)).not.toBeVisible()
  }

  // ========== Search & Filter ==========

  async searchContacts(query: string) {
    await this.page.fill('input[placeholder*="Search"]', query)
    await this.page.waitForLoadState('networkidle')
  }

  async filterByGroup(groupName: string) {
    await this.page.click('[aria-label="Filter by group"], button:has-text("Group")')
    await this.page.click(`[role="option"]:has-text("${groupName}")`)
    await this.page.waitForLoadState('networkidle')
  }

  async filterByInternal(isInternal: boolean) {
    await this.page.click('[aria-label="Filter"], button:has-text("Filter")')
    await this.page.click(`[role="option"]:has-text("${isInternal ? 'Internal' : 'External'}")`)
    await this.page.waitForLoadState('networkidle')
  }

  async clearFilters() {
    await this.page.click('button:has-text("Clear")')
    await this.page.waitForLoadState('networkidle')
  }

  // ========== Groups/Tags Management ==========

  async createGroup(options: { name: string; color?: string }) {
    await this.switchToTagsTab()
    
    await this.page.click('button:has-text("Add Group"), button:has-text("New")')
    await expect(this.page.locator('[role="dialog"], form')).toBeVisible()
    
    await this.page.fill('input[name="name"]', options.name)
    
    if (options.color) {
      await this.page.click(`[data-color="${options.color}"], button[style*="${options.color}"]`)
    }
    
    await this.page.click('button:has-text("Create"), button:has-text("Save")')
    await this.page.waitForLoadState('networkidle')
  }

  async editGroup(currentName: string, newName: string) {
    await this.switchToTagsTab()
    
    await this.page.click(`tr:has-text("${currentName}") button:has-text("Edit")`)
    await this.page.fill('input[name="name"]', newName)
    await this.page.click('button:has-text("Save")')
    await this.page.waitForLoadState('networkidle')
  }

  async deleteGroup(groupName: string) {
    await this.switchToTagsTab()
    
    await this.page.click(`tr:has-text("${groupName}") button:has-text("Delete")`)
    
    const confirmButton = this.page.locator('button:has-text("Confirm")')
    if (await confirmButton.isVisible()) {
      await confirmButton.click()
    }
    
    await this.page.waitForLoadState('networkidle')
  }

  async assignContactToGroup(contactEmail: string, groupName: string) {
    await this.switchToContactsTab()
    
    await this.page.click(`tr:has-text("${contactEmail}") button:has-text("Edit")`)
    await this.page.click('[aria-label="Groups"], button:has-text("Groups")')
    await this.page.click(`[role="option"]:has-text("${groupName}")`)
    await this.page.click('button:has-text("Save")')
    await this.page.waitForLoadState('networkidle')
  }

  async removeContactFromGroup(contactEmail: string, groupName: string) {
    await this.switchToContactsTab()
    
    await this.page.click(`tr:has-text("${contactEmail}") button:has-text("Edit")`)
    // Click to deselect the group
    await this.page.click(`[data-testid="group-chip-${groupName}"] button:has-text("×")`)
    await this.page.click('button:has-text("Save")')
    await this.page.waitForLoadState('networkidle')
  }

  // ========== Import ==========

  async openImportModal() {
    await this.page.click('button:has-text("Import")')
    await expect(this.page.locator('[role="dialog"]')).toBeVisible()
  }

  async importExcel(filePath: string) {
    await this.openImportModal()
    
    await this.page.setInputFiles('input[type="file"]', filePath)
    await this.page.waitForLoadState('networkidle')
    
    // Preview should appear
    await expect(this.page.locator('table, [data-testid="import-preview"]')).toBeVisible()
    
    // Complete import
    await this.page.click('button:has-text("Import"), button:has-text("Confirm")')
    await this.page.waitForLoadState('networkidle')
  }
}
