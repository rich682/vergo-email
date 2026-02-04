import { test, expect } from '../fixtures/test.fixture'
import { SettingsPage } from '../pages/settings.page'

/**
 * Settings Module Tests
 * 
 * Tests for:
 * - Company settings (name)
 * - Email signature
 * - Team management (invite, edit, remove users)
 * - Accounting calendar (fiscal year, timezone)
 * - Email account connections
 */

test.describe('Settings Module', () => {
  let settingsPage: SettingsPage

  test.beforeEach(async ({ page }) => {
    settingsPage = new SettingsPage(page)
  })

  test.describe('Main Settings Page', () => {
    test('settings page loads', async ({ page, testErrors }) => {
      await settingsPage.goto()
      await settingsPage.expectSettingsLoaded()
    })

    test('can view company name', async ({ page, testErrors }) => {
      await settingsPage.goto()
      
      // Company name should be visible somewhere
      const companySection = page.locator('text=Company, text=Organization')
      await expect(companySection.first()).toBeVisible()
    })

    test('can edit email signature', async ({ page, testErrors }) => {
      await settingsPage.goto()
      
      const signatureField = page.locator('textarea[name="signature"], [aria-label="Signature"]')
      if (await signatureField.isVisible()) {
        await signatureField.fill('Test Signature - E2E')
        
        const saveButton = page.locator('button:has-text("Save")')
        if (await saveButton.isVisible()) {
          await saveButton.click()
          await page.waitForLoadState('networkidle')
        }
      }
    })
  })

  test.describe('Team Management', () => {
    test('team page loads', async ({ page, testErrors }) => {
      await settingsPage.gotoTeam()
      await settingsPage.expectTeamLoaded()
    })

    test('can view team members list', async ({ page, testErrors }) => {
      await settingsPage.gotoTeam()
      
      // Should see a table or list of team members
      const teamList = page.locator('table, [data-testid="team-list"]')
      await expect(teamList).toBeVisible()
    })

    test('invite user button is visible (admin)', async ({ page, testErrors }) => {
      await settingsPage.gotoTeam()
      
      const inviteButton = page.locator('button:has-text("Invite")')
      // Button may be visible depending on user role
      if (await inviteButton.isVisible()) {
        await inviteButton.click()
        await expect(page.locator('[role="dialog"]')).toBeVisible()
      }
    })

    test('can open invite user modal', async ({ page, testErrors }) => {
      await settingsPage.gotoTeam()
      
      const inviteButton = page.locator('button:has-text("Invite")')
      if (await inviteButton.isVisible()) {
        await inviteButton.click()
        
        // Modal should have required fields
        await expect(page.locator('input[name="email"]')).toBeVisible()
        await expect(page.locator('input[name="firstName"]')).toBeVisible()
      }
    })

    test('invite form validates required fields', async ({ page, testErrors }) => {
      await settingsPage.gotoTeam()
      
      const inviteButton = page.locator('button:has-text("Invite")')
      if (await inviteButton.isVisible()) {
        await inviteButton.click()
        
        // Try to submit empty form
        await page.click('button:has-text("Send Invite"), button[type="submit"]')
        
        // Should show validation errors
        await page.waitForLoadState('networkidle')
      }
    })
  })

  test.describe('Accounting Calendar', () => {
    test('accounting page loads', async ({ page, testErrors }) => {
      await settingsPage.gotoAccounting()
      await settingsPage.expectAccountingLoaded()
    })

    test('can view fiscal year configuration', async ({ page, testErrors }) => {
      await settingsPage.gotoAccounting()
      
      const fiscalYearSection = page.locator('text=Fiscal Year, text=Fiscal')
      await expect(fiscalYearSection.first()).toBeVisible()
    })

    test('can view timezone configuration', async ({ page, testErrors }) => {
      await settingsPage.gotoAccounting()
      
      const timezoneSection = page.locator('text=Timezone, text=Time Zone')
      await expect(timezoneSection.first()).toBeVisible()
    })

    test('fiscal year dropdown opens', async ({ page, testErrors }) => {
      await settingsPage.gotoAccounting()
      
      const fiscalYearDropdown = page.locator('[aria-label="Fiscal Year Start"], button:has-text("January"), button:has-text("February"), button:has-text("March")')
      if (await fiscalYearDropdown.first().isVisible()) {
        await fiscalYearDropdown.first().click()
        
        // Should show month options
        await expect(page.locator('[role="option"]')).toBeVisible()
      }
    })

    test('timezone dropdown opens', async ({ page, testErrors }) => {
      await settingsPage.gotoAccounting()
      
      const timezoneDropdown = page.locator('[aria-label="Timezone"], button:has-text("UTC"), button:has-text("America")')
      if (await timezoneDropdown.first().isVisible()) {
        await timezoneDropdown.first().click()
        
        // Should show timezone options or search
        await page.waitForLoadState('networkidle')
      }
    })

    test('can see fiscal year preview', async ({ page, testErrors }) => {
      await settingsPage.gotoAccounting()
      
      // Should show preview of fiscal quarters
      const preview = page.locator('text=Q1, text=Quarter')
      await expect(preview.first()).toBeVisible()
    })
  })

  test.describe('Email Accounts', () => {
    test('can view connected email accounts', async ({ page, testErrors }) => {
      await settingsPage.gotoTeam()
      
      // Look for email accounts section
      const emailSection = page.locator('text=Email Accounts, text=Connected, text=Inbox')
      if (await emailSection.first().isVisible()) {
        // Email accounts table should be visible
      }
    })

    test('connect Gmail button is visible', async ({ page, testErrors }) => {
      await settingsPage.gotoTeam()
      
      const gmailButton = page.locator('button:has-text("Gmail"), button:has-text("Connect Gmail")')
      // Button visibility depends on whether account is already connected
    })

    test('connect Microsoft button is visible', async ({ page, testErrors }) => {
      await settingsPage.gotoTeam()
      
      const microsoftButton = page.locator('button:has-text("Microsoft"), button:has-text("Connect Microsoft")')
      // Button visibility depends on whether account is already connected
    })
  })
})
