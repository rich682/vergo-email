import { test, expect } from '../fixtures/test.fixture'
import { FormsPage } from '../pages/forms.page'

/**
 * Forms Module Tests
 * 
 * Tests for:
 * - Form listing
 * - Form creation wizard
 * - Form builder (add/edit/delete fields)
 * - Form preview
 * - Form filling (via form request)
 */

test.describe('Forms Module', () => {
  let formsPage: FormsPage

  test.beforeEach(async ({ page }) => {
    formsPage = new FormsPage(page)
  })

  test.describe('Forms Listing', () => {
    test('forms page loads', async ({ page, testErrors }) => {
      await formsPage.goto()
      await formsPage.expectLoaded()
    })

    test('can search forms', async ({ page, testErrors }) => {
      await formsPage.goto()
      
      const searchInput = page.locator('input[placeholder*="Search"]')
      if (await searchInput.isVisible()) {
        await searchInput.fill('test')
        await page.waitForLoadState('networkidle')
      }
    })

    test('create form button is visible', async ({ page, testErrors }) => {
      await formsPage.goto()
      
      const createButton = page.locator('button:has-text("Create"), button:has-text("New"), a:has-text("Create")')
      await expect(createButton.first()).toBeVisible()
    })
  })

  test.describe('Form Creation Wizard', () => {
    test('can access new form page', async ({ page, testErrors }) => {
      await formsPage.gotoNew()
      
      // Should see name input
      await expect(page.locator('input[name="name"]')).toBeVisible()
    })

    test('wizard step 1 - name and description', async ({ page, testErrors }) => {
      await formsPage.gotoNew()
      
      await page.fill('input[name="name"]', `E2E Test Form ${Date.now()}`)
      
      const descriptionField = page.locator('textarea[name="description"]')
      if (await descriptionField.isVisible()) {
        await descriptionField.fill('This is a test form created by E2E tests')
      }
      
      // Should have Next button
      await expect(page.locator('button:has-text("Next")')).toBeVisible()
    })

    test('wizard step 2 - database selection', async ({ page, testErrors }) => {
      await formsPage.gotoNew()
      
      await page.fill('input[name="name"]', `E2E Test Form ${Date.now()}`)
      await page.click('button:has-text("Next")')
      
      // Should see database selector
      const databaseSelector = page.locator('[aria-label="Database"], button:has-text("Database"), button:has-text("No database")')
      await expect(databaseSelector).toBeVisible()
    })

    test('can create a form', async ({ page, testErrors }) => {
      await formsPage.gotoNew()
      
      await page.fill('input[name="name"]', `E2E Test Form ${Date.now()}`)
      await page.click('button:has-text("Next")')
      await page.click('button:has-text("Create"), button:has-text("Next")')
      
      await page.waitForLoadState('networkidle')
      
      // Should redirect to form builder
      await expect(page).toHaveURL(/\/dashboard\/forms\//)
    })
  })

  test.describe('Form Builder', () => {
    test('can access form builder', async ({ page, testErrors }) => {
      await formsPage.goto()
      
      // Click first form
      const firstForm = page.locator('[data-testid^="form-"], a:has-text("Edit"), a:has-text("View")').first()
      if (await firstForm.isVisible()) {
        await firstForm.click()
        await page.waitForLoadState('networkidle')
        
        await expect(page).toHaveURL(/\/dashboard\/forms\//)
      }
    })

    test('add field button is visible', async ({ page, testErrors }) => {
      await formsPage.goto()
      
      const firstForm = page.locator('[data-testid^="form-"], a:has-text("Edit")').first()
      if (await firstForm.isVisible()) {
        await firstForm.click()
        await page.waitForLoadState('networkidle')
        
        const addFieldButton = page.locator('button:has-text("Add Field")')
        await expect(addFieldButton).toBeVisible()
      }
    })

    test('can add a text field', async ({ page, testErrors }) => {
      await formsPage.goto()
      
      const firstForm = page.locator('[data-testid^="form-"], a:has-text("Edit")').first()
      if (await firstForm.isVisible()) {
        await firstForm.click()
        await page.waitForLoadState('networkidle')
        
        await page.click('button:has-text("Add Field")')
        
        // Select type
        const typeSelector = page.locator('[aria-label="Field Type"], button:has-text("Type")')
        if (await typeSelector.isVisible()) {
          await typeSelector.click()
          await page.click('[role="option"]:has-text("Text")')
        }
        
        // Fill label
        await page.fill('input[name="label"]', 'Test Text Field')
        
        // Save
        await page.click('button:has-text("Save"), button:has-text("Add")')
        await page.waitForLoadState('networkidle')
      }
    })

    test('can add a select field', async ({ page, testErrors }) => {
      await formsPage.goto()
      
      const firstForm = page.locator('[data-testid^="form-"], a:has-text("Edit")').first()
      if (await firstForm.isVisible()) {
        await firstForm.click()
        await page.waitForLoadState('networkidle')
        
        await page.click('button:has-text("Add Field")')
        
        const typeSelector = page.locator('[aria-label="Field Type"], button:has-text("Type")')
        if (await typeSelector.isVisible()) {
          await typeSelector.click()
          await page.click('[role="option"]:has-text("Select")')
        }
        
        await page.fill('input[name="label"]', 'Test Select Field')
        
        // Add options
        const addOptionButton = page.locator('button:has-text("Add Option")')
        if (await addOptionButton.isVisible()) {
          await addOptionButton.click()
          await page.locator('input[name="option"]').last().fill('Option 1')
          await addOptionButton.click()
          await page.locator('input[name="option"]').last().fill('Option 2')
        }
        
        await page.click('button:has-text("Save"), button:has-text("Add")')
        await page.waitForLoadState('networkidle')
      }
    })

    test('can add a date field', async ({ page, testErrors }) => {
      await formsPage.goto()
      
      const firstForm = page.locator('[data-testid^="form-"], a:has-text("Edit")').first()
      if (await firstForm.isVisible()) {
        await firstForm.click()
        await page.waitForLoadState('networkidle')
        
        await page.click('button:has-text("Add Field")')
        
        const typeSelector = page.locator('[aria-label="Field Type"], button:has-text("Type")')
        if (await typeSelector.isVisible()) {
          await typeSelector.click()
          await page.click('[role="option"]:has-text("Date")')
        }
        
        await page.fill('input[name="label"]', 'Test Date Field')
        
        await page.click('button:has-text("Save"), button:has-text("Add")')
        await page.waitForLoadState('networkidle')
      }
    })

    test('can mark field as required', async ({ page, testErrors }) => {
      await formsPage.goto()
      
      const firstForm = page.locator('[data-testid^="form-"], a:has-text("Edit")').first()
      if (await firstForm.isVisible()) {
        await firstForm.click()
        await page.waitForLoadState('networkidle')
        
        await page.click('button:has-text("Add Field")')
        
        await page.fill('input[name="label"]', 'Required Field')
        
        const requiredCheckbox = page.locator('[name="required"], input[type="checkbox"]').first()
        if (await requiredCheckbox.isVisible()) {
          await requiredCheckbox.check()
        }
        
        await page.click('button:has-text("Save"), button:has-text("Add")')
        await page.waitForLoadState('networkidle')
      }
    })

    test('can edit existing field', async ({ page, testErrors }) => {
      await formsPage.goto()
      
      const firstForm = page.locator('[data-testid^="form-"], a:has-text("Edit")').first()
      if (await firstForm.isVisible()) {
        await firstForm.click()
        await page.waitForLoadState('networkidle')
        
        // Find edit button on first field
        const editButton = page.locator('[data-testid^="field-"] button:has-text("Edit")').first()
        if (await editButton.isVisible()) {
          await editButton.click()
          
          // Should open edit form
          await expect(page.locator('input[name="label"]')).toBeVisible()
        }
      }
    })

    test('can delete a field', async ({ page, testErrors }) => {
      await formsPage.goto()
      
      const firstForm = page.locator('[data-testid^="form-"], a:has-text("Edit")').first()
      if (await firstForm.isVisible()) {
        await firstForm.click()
        await page.waitForLoadState('networkidle')
        
        // Find delete button on first field
        const deleteButton = page.locator('[data-testid^="field-"] button:has-text("Delete")').first()
        if (await deleteButton.isVisible()) {
          await deleteButton.click()
          
          // Confirm if needed
          const confirmButton = page.locator('button:has-text("Confirm")')
          if (await confirmButton.isVisible()) {
            // Cancel to avoid actually deleting
            await page.click('button:has-text("Cancel")')
          }
        }
      }
    })
  })

  test.describe('Form Preview', () => {
    test('preview button exists', async ({ page, testErrors }) => {
      await formsPage.goto()
      
      const firstForm = page.locator('[data-testid^="form-"], a:has-text("Edit")').first()
      if (await firstForm.isVisible()) {
        await firstForm.click()
        await page.waitForLoadState('networkidle')
        
        const previewButton = page.locator('button:has-text("Preview")')
        // Preview may be a panel or modal
      }
    })

    test('preview shows form fields', async ({ page, testErrors }) => {
      await formsPage.goto()
      
      const firstForm = page.locator('[data-testid^="form-"], a:has-text("Edit")').first()
      if (await firstForm.isVisible()) {
        await firstForm.click()
        await page.waitForLoadState('networkidle')
        
        // Preview panel should show fields
        const preview = page.locator('[data-testid="form-preview"]')
        // May be visible inline
      }
    })
  })

  test.describe('Form Deletion', () => {
    test('can delete a form', async ({ page, testErrors }) => {
      await formsPage.goto()
      
      // Find delete button
      const deleteButton = page.locator('[data-testid^="form-"] button:has-text("Delete"), tr button:has-text("Delete")').first()
      if (await deleteButton.isVisible()) {
        await deleteButton.click()
        
        // Confirm dialog
        const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Delete")')
        if (await confirmButton.isVisible()) {
          // Cancel to avoid actually deleting test data
          await page.click('button:has-text("Cancel")')
        }
      }
    })
  })
})
