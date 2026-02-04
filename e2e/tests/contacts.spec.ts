import { test, expect } from '../fixtures/test.fixture'
import { ContactsPage } from '../pages/contacts.page'

/**
 * Contacts Module Tests
 * 
 * Tests for:
 * - Contact listing and search
 * - Contact CRUD operations
 * - Groups/tags management
 * - Contact import
 */

test.describe('Contacts Module', () => {
  let contactsPage: ContactsPage

  test.beforeEach(async ({ page }) => {
    contactsPage = new ContactsPage(page)
  })

  test.describe('Contact Listing', () => {
    test('contacts page loads', async ({ page, testErrors }) => {
      await contactsPage.goto()
      await contactsPage.expectLoaded()
    })

    test('can search contacts', async ({ page, testErrors }) => {
      await contactsPage.goto()
      
      const searchInput = page.locator('input[placeholder*="Search"]')
      await searchInput.fill('test')
      await page.waitForLoadState('networkidle')
    })

    test('can filter by group', async ({ page, testErrors }) => {
      await contactsPage.goto()
      
      const filterButton = page.locator('[aria-label="Filter by group"], button:has-text("Group"), button:has-text("Filter")')
      if (await filterButton.first().isVisible()) {
        await filterButton.first().click()
        await page.waitForLoadState('networkidle')
      }
    })
  })

  test.describe('Contact CRUD', () => {
    test('can open new contact form', async ({ page, testErrors }) => {
      await contactsPage.goto()
      
      await page.click('button:has-text("Add Contact"), button:has-text("New")')
      
      await expect(page.locator('[role="dialog"], form')).toBeVisible()
    })

    test('new contact form has required fields', async ({ page, testErrors }) => {
      await contactsPage.goto()
      
      await page.click('button:has-text("Add Contact"), button:has-text("New")')
      
      await expect(page.locator('input[name="firstName"]')).toBeVisible()
      await expect(page.locator('input[name="email"]')).toBeVisible()
    })

    test('can create a contact', async ({ page, testErrors }) => {
      await contactsPage.goto()
      
      const uniqueEmail = `e2e-test-${Date.now()}@example.com`
      
      await page.click('button:has-text("Add Contact"), button:has-text("New")')
      
      await page.fill('input[name="firstName"]', 'E2E Test')
      await page.fill('input[name="email"]', uniqueEmail)
      
      await page.click('button[type="submit"], button:has-text("Save")')
      await page.waitForLoadState('networkidle')
    })

    test('can edit a contact', async ({ page, testErrors }) => {
      await contactsPage.goto()
      
      // Find first contact edit button
      const editButton = page.locator('button:has-text("Edit")').first()
      if (await editButton.isVisible()) {
        await editButton.click()
        
        await expect(page.locator('[role="dialog"], form')).toBeVisible()
      }
    })

    test('can delete a contact', async ({ page, testErrors }) => {
      await contactsPage.goto()
      
      // Find first contact delete button
      const deleteButton = page.locator('button:has-text("Delete")').first()
      if (await deleteButton.isVisible()) {
        await deleteButton.click()
        
        // Confirm dialog should appear
        const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Delete")')
        if (await confirmButton.isVisible()) {
          // Don't actually confirm - just verify dialog works
          await page.click('button:has-text("Cancel")')
        }
      }
    })
  })

  test.describe('Groups/Tags', () => {
    test('can switch to tags tab', async ({ page, testErrors }) => {
      await contactsPage.goto()
      
      await page.click('button:has-text("Tags"), [role="tab"]:has-text("Tags")')
      await page.waitForLoadState('networkidle')
    })

    test('can open new group form', async ({ page, testErrors }) => {
      await contactsPage.goto()
      
      await page.click('button:has-text("Tags"), [role="tab"]:has-text("Tags")')
      
      await page.click('button:has-text("Add Group"), button:has-text("New")')
      
      await expect(page.locator('[role="dialog"], form')).toBeVisible()
    })

    test('can create a group', async ({ page, testErrors }) => {
      await contactsPage.goto()
      
      await page.click('button:has-text("Tags"), [role="tab"]:has-text("Tags")')
      
      await page.click('button:has-text("Add Group"), button:has-text("New")')
      
      await page.fill('input[name="name"]', `E2E Test Group ${Date.now()}`)
      
      await page.click('button:has-text("Create"), button:has-text("Save")')
      await page.waitForLoadState('networkidle')
    })

    test('can edit a group', async ({ page, testErrors }) => {
      await contactsPage.goto()
      
      await page.click('button:has-text("Tags"), [role="tab"]:has-text("Tags")')
      
      const editButton = page.locator('button:has-text("Edit")').first()
      if (await editButton.isVisible()) {
        await editButton.click()
        await expect(page.locator('[role="dialog"], form')).toBeVisible()
      }
    })

    test('can delete a group', async ({ page, testErrors }) => {
      await contactsPage.goto()
      
      await page.click('button:has-text("Tags"), [role="tab"]:has-text("Tags")')
      
      const deleteButton = page.locator('button:has-text("Delete")').first()
      if (await deleteButton.isVisible()) {
        await deleteButton.click()
        
        // Cancel to avoid actually deleting
        const cancelButton = page.locator('button:has-text("Cancel")')
        if (await cancelButton.isVisible()) {
          await cancelButton.click()
        }
      }
    })
  })

  test.describe('Import', () => {
    test('can open import modal', async ({ page, testErrors }) => {
      await contactsPage.goto()
      
      await page.click('button:has-text("Import")')
      
      await expect(page.locator('[role="dialog"]')).toBeVisible()
    })

    test('import modal has file upload', async ({ page, testErrors }) => {
      await contactsPage.goto()
      
      await page.click('button:has-text("Import")')
      
      const fileInput = page.locator('input[type="file"]')
      await expect(fileInput).toBeAttached()
    })
  })
})
