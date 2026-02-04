import { Page, expect } from '@playwright/test'

/**
 * Jobs/Tasks Page Object Model
 * 
 * Handles interactions with the Jobs module:
 * - View and filter jobs
 * - Edit job metadata
 * - Manage collaborators and stakeholders
 * - Send requests (standard, data personalization, form)
 * - View collection/evidence
 */
export class JobsPage {
  constructor(private page: Page) {}

  // Navigation
  async goto() {
    await this.page.goto('/dashboard/jobs')
    await this.page.waitForLoadState('networkidle')
  }

  async gotoJob(jobId: string) {
    await this.page.goto(`/dashboard/jobs/${jobId}`)
    await this.page.waitForLoadState('networkidle')
  }

  // Verify page loaded
  async expectLoaded() {
    await expect(this.page.locator('h1:has-text("Tasks"), h2:has-text("Tasks")')).toBeVisible()
  }

  // ========== Job Detail ==========

  // Switch tabs
  async switchToTab(tab: 'Overview' | 'Requests' | 'Collection' | 'Compare' | 'Report') {
    await this.page.click(`button:has-text("${tab}"), [role="tab"]:has-text("${tab}")`)
    await this.page.waitForLoadState('networkidle')
  }

  // Edit job name
  async editJobName(newName: string) {
    await this.page.click('[data-testid="edit-name"], button:has([class*="edit"]):near(h1)')
    await this.page.fill('input[name="name"]', newName)
    await this.page.click('button:has-text("Save")')
  }

  // Edit job description
  async editJobDescription(description: string) {
    await this.page.click('[data-testid="edit-description"]')
    await this.page.fill('textarea[name="description"]', description)
    await this.page.click('button:has-text("Save")')
  }

  // Set deadline
  async setDeadline(date: string) {
    await this.page.click('[data-testid="deadline"], button:has-text("Deadline")')
    await this.page.fill('input[type="date"]', date)
  }

  // Change status
  async changeStatus(status: 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETE') {
    await this.page.click('[aria-label="Status"], button:has-text("Status")')
    const statusLabels: Record<string, string> = {
      'NOT_STARTED': 'Not Started',
      'IN_PROGRESS': 'In Progress',
      'BLOCKED': 'Blocked',
      'COMPLETE': 'Complete',
    }
    await this.page.click(`[role="option"]:has-text("${statusLabels[status]}")`)
  }

  // ========== Collaborators ==========

  async addCollaborator(name: string) {
    await this.page.click('button:has-text("Add Collaborator")')
    await this.page.fill('input[placeholder*="Search"]', name)
    await this.page.click(`[role="option"]:has-text("${name}")`)
    await this.page.waitForLoadState('networkidle')
  }

  async removeCollaborator(name: string) {
    await this.page.click(`[data-testid="collaborator-${name}"] button:has-text("Remove")`)
    await this.page.waitForLoadState('networkidle')
  }

  // ========== Stakeholders ==========

  async addStakeholderByType(type: 'EMPLOYEE' | 'VENDOR' | 'CLIENT' | 'PARTNER' | 'OTHER') {
    await this.page.click('button:has-text("Add Stakeholder")')
    await this.page.click('button:has-text("By Type")')
    await this.page.click(`[role="option"]:has-text("${type}")`)
    await this.page.click('button:has-text("Add")')
  }

  async addStakeholderByGroup(groupName: string) {
    await this.page.click('button:has-text("Add Stakeholder")')
    await this.page.click('button:has-text("By Group")')
    await this.page.click(`[role="option"]:has-text("${groupName}")`)
    await this.page.click('button:has-text("Add")')
  }

  async addIndividualStakeholder(email: string) {
    await this.page.click('button:has-text("Add Stakeholder")')
    await this.page.click('button:has-text("Individual")')
    await this.page.fill('input[placeholder*="Search"]', email)
    await this.page.click(`[role="option"]:has-text("${email}")`)
    await this.page.click('button:has-text("Add")')
  }

  // ========== Send Request Modal ==========

  async openSendRequestModal() {
    await this.page.click('button:has-text("Send Request"), button:has-text("New")')
    await expect(this.page.locator('[role="dialog"]')).toBeVisible()
  }

  async selectRequestMode(mode: 'standard' | 'data_personalization' | 'form_request') {
    const modeLabels: Record<string, string> = {
      'standard': 'Standard',
      'data_personalization': 'Data Personalization',
      'form_request': 'Form Request',
    }
    await this.page.click(`button:has-text("${modeLabels[mode]}"), [data-testid="mode-${mode}"]`)
  }

  // ========== Standard Request Flow ==========

  async selectRecipients(emails: string[]) {
    for (const email of emails) {
      await this.page.click(`[data-testid="recipient"]:has-text("${email}")`)
    }
  }

  async filterRecipientsByLabel(label: string) {
    await this.page.click('button:has-text("Filter")')
    await this.page.click(`[role="option"]:has-text("${label}")`)
  }

  async editEmailSubject(subject: string) {
    await this.page.fill('input[name="subject"]', subject)
  }

  async editEmailBody(body: string) {
    await this.page.fill('textarea[name="body"], [contenteditable="true"]', body)
  }

  async refineWithAI(instructions: string) {
    await this.page.click('button:has-text("Refine")')
    await this.page.fill('textarea[name="instructions"]', instructions)
    await this.page.click('button:has-text("Apply")')
    await this.page.waitForLoadState('networkidle')
  }

  async configureReminders(options: { enabled: boolean; frequency?: number }) {
    const toggle = this.page.locator('[name="remindersEnabled"]')
    const isChecked = await toggle.isChecked()
    if (isChecked !== options.enabled) {
      await toggle.click()
    }
    if (options.enabled && options.frequency) {
      await this.page.fill('input[name="reminderFrequency"]', options.frequency.toString())
    }
  }

  async sendRequest() {
    await this.page.click('button:has-text("Send")')
    await this.page.waitForLoadState('networkidle')
  }

  // ========== Data Personalization Flow ==========

  async selectDatabase(databaseName: string) {
    await this.page.click('button:has-text("Select Database")')
    await this.page.click(`[role="option"]:has-text("${databaseName}")`)
  }

  async mapColumn(field: string, column: string) {
    await this.page.click(`button:has-text("${field}")`)
    await this.page.click(`[role="option"]:has-text("${column}")`)
  }

  async insertMergeField(fieldName: string) {
    await this.page.click('button:has-text("Insert Field")')
    await this.page.click(`[role="option"]:has-text("${fieldName}")`)
  }

  // ========== Form Request Flow ==========

  async selectForm(formName: string) {
    await this.page.click('button:has-text("Select Form")')
    await this.page.click(`[role="option"]:has-text("${formName}")`)
  }

  async selectFormRecipients(userEmails: string[]) {
    for (const email of userEmails) {
      await this.page.click(`[data-testid="user"]:has-text("${email}")`)
    }
  }

  async setFormDeadline(date: string) {
    await this.page.fill('input[name="deadline"]', date)
  }

  async sendFormRequest() {
    await this.page.click('button:has-text("Send Form")')
    await this.page.waitForLoadState('networkidle')
  }

  // ========== Collection Tab ==========

  async uploadFile(filePath: string) {
    await this.page.click('button:has-text("Upload")')
    await this.page.setInputFiles('input[type="file"]', filePath)
    await this.page.click('button:has-text("Upload"), button:has-text("Submit")')
    await this.page.waitForLoadState('networkidle')
  }

  async downloadFile(fileName: string) {
    const downloadPromise = this.page.waitForEvent('download')
    await this.page.click(`[data-testid="file-${fileName}"] button:has-text("Download")`)
    const download = await downloadPromise
    return download.path()
  }

  // ========== Request Cards ==========

  async expandRequestCard(requestIndex: number = 0) {
    await this.page.click(`[data-testid="request-card"]:nth-child(${requestIndex + 1})`)
  }

  async updateRecipientStatus(email: string, status: 'NO_REPLY' | 'REPLIED' | 'COMPLETE') {
    await this.page.click(`[data-testid="recipient-${email}"] [aria-label="Status"]`)
    await this.page.click(`[role="option"]:has-text("${status}")`)
  }

  async sendReminder(email: string) {
    await this.page.click(`[data-testid="recipient-${email}"] button:has-text("Remind")`)
  }
}
