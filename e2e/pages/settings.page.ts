import { Page, expect } from '@playwright/test'

/**
 * Settings Page Object Model
 * 
 * Handles interactions with the Settings module:
 * - Company settings (name)
 * - Team management (invite, edit, remove users)
 * - Accounting calendar (fiscal year, timezone)
 * - Email accounts (connect, disconnect)
 */
export class SettingsPage {
  constructor(private page: Page) {}

  // ========== Navigation ==========

  async goto() {
    await this.page.goto('/dashboard/settings')
    await this.page.waitForLoadState('networkidle')
  }

  async gotoTeam() {
    await this.page.goto('/dashboard/settings/team')
    await this.page.waitForLoadState('networkidle')
  }

  async gotoAccounting() {
    await this.page.goto('/dashboard/settings/accounting')
    await this.page.waitForLoadState('networkidle')
  }

  // Verify pages loaded
  async expectSettingsLoaded() {
    await expect(this.page.locator('h1:has-text("Settings"), h2:has-text("Settings")')).toBeVisible()
  }

  async expectTeamLoaded() {
    await expect(this.page.locator('h1:has-text("Team"), h2:has-text("Team")')).toBeVisible()
  }

  async expectAccountingLoaded() {
    await expect(this.page.locator('h1:has-text("Accounting"), h2:has-text("Calendar")')).toBeVisible()
  }

  // ========== Company Settings ==========

  async editCompanyName(name: string) {
    await this.page.click('[data-testid="edit-company-name"], button:has-text("Edit")')
    await this.page.fill('input[name="companyName"], input[name="name"]', name)
    await this.page.click('button:has-text("Save")')
    await this.page.waitForLoadState('networkidle')
  }

  async editEmailSignature(signature: string) {
    await this.page.fill('textarea[name="signature"]', signature)
    await this.page.click('button:has-text("Save")')
    await this.page.waitForLoadState('networkidle')
  }

  async expectCompanyName(name: string) {
    await expect(this.page.locator(`text=${name}`)).toBeVisible()
  }

  // ========== Team Management ==========

  async inviteUser(options: {
    email: string
    firstName: string
    lastName?: string
    role: 'ADMIN' | 'MEMBER'
  }) {
    await this.page.click('button:has-text("Invite")')
    await expect(this.page.locator('[role="dialog"]')).toBeVisible()
    
    await this.page.fill('input[name="email"]', options.email)
    await this.page.fill('input[name="firstName"]', options.firstName)
    if (options.lastName) {
      await this.page.fill('input[name="lastName"]', options.lastName)
    }
    
    // Select role
    await this.page.click('[aria-label="Role"], button:has-text("Role")')
    await this.page.click(`[role="option"]:has-text("${options.role}")`)
    
    await this.page.click('button:has-text("Send Invite"), button[type="submit"]')
    await this.page.waitForLoadState('networkidle')
  }

  async editUserRole(email: string, newRole: 'ADMIN' | 'MEMBER' | 'VIEWER') {
    // Find user row and click edit
    await this.page.click(`tr:has-text("${email}") button:has-text("Edit")`)
    
    // Change role
    await this.page.click('[aria-label="Role"], button:has-text("Role")')
    await this.page.click(`[role="option"]:has-text("${newRole}")`)
    
    await this.page.click('button:has-text("Save")')
    await this.page.waitForLoadState('networkidle')
  }

  async removeUser(email: string) {
    await this.page.click(`tr:has-text("${email}") button:has-text("Remove"), tr:has-text("${email}") button:has-text("Delete")`)
    
    // Confirm dialog
    const confirmButton = this.page.locator('button:has-text("Confirm"), button:has-text("Delete")')
    if (await confirmButton.isVisible()) {
      await confirmButton.click()
    }
    
    await this.page.waitForLoadState('networkidle')
  }

  async expectUserInList(email: string) {
    await expect(this.page.locator(`text=${email}`)).toBeVisible()
  }

  async expectUserNotInList(email: string) {
    await expect(this.page.locator(`text=${email}`)).not.toBeVisible()
  }

  // ========== Accounting Calendar ==========

  async setFiscalYearStart(month: number) {
    await this.page.click('[aria-label="Fiscal Year Start"], button:has-text("Fiscal")')
    
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ]
    await this.page.click(`[role="option"]:has-text("${monthNames[month - 1]}")`)
    
    await this.page.click('button:has-text("Save")')
    await this.page.waitForLoadState('networkidle')
  }

  async setTimezone(timezone: string) {
    await this.page.click('[aria-label="Timezone"], button:has-text("Timezone")')
    await this.page.fill('input[placeholder*="Search"]', timezone)
    await this.page.click(`[role="option"]:has-text("${timezone}")`)
    
    await this.page.click('button:has-text("Save")')
    await this.page.waitForLoadState('networkidle')
  }

  async expectFiscalYearPreview(expectedText: string) {
    await expect(this.page.locator(`text=${expectedText}`)).toBeVisible()
  }

  // ========== Email Accounts ==========

  async connectGmail() {
    await this.page.click('button:has-text("Connect Gmail"), button:has-text("Gmail")')
    // Note: OAuth flow will redirect - test should handle this
  }

  async connectMicrosoft() {
    await this.page.click('button:has-text("Connect Microsoft"), button:has-text("Microsoft")')
    // Note: OAuth flow will redirect - test should handle this
  }

  async disconnectEmailAccount(email: string) {
    await this.page.click(`tr:has-text("${email}") button:has-text("Disconnect")`)
    
    // Confirm if dialog appears
    const confirmButton = this.page.locator('button:has-text("Confirm")')
    if (await confirmButton.isVisible()) {
      await confirmButton.click()
    }
    
    await this.page.waitForLoadState('networkidle')
  }

  async expectEmailAccountConnected(email: string) {
    await expect(this.page.locator(`text=${email}`)).toBeVisible()
  }
}
