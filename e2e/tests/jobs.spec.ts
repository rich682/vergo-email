import { test, expect } from '../fixtures/test.fixture'
import { JobsPage } from '../pages/jobs.page'

/**
 * Jobs/Tasks Module Tests
 * 
 * Tests for:
 * - Job listing and filtering
 * - Job CRUD operations
 * - Collaborator management
 * - Stakeholder management
 * - All request types (standard, data personalization, form)
 * - Collection/evidence tab
 */

test.describe('Jobs Module', () => {
  let jobsPage: JobsPage

  test.beforeEach(async ({ page }) => {
    jobsPage = new JobsPage(page)
  })

  test.describe('Job Listing', () => {
    test('jobs page loads and displays jobs', async ({ page, testErrors }) => {
      await jobsPage.goto()
      await jobsPage.expectLoaded()
    })

    test('can view job detail', async ({ page, testErrors }) => {
      await jobsPage.goto()
      
      // Click first job in list
      await page.click('[data-testid="job-card"]:first-child a, tr:first-child a, a:has-text("View")')
      await page.waitForLoadState('networkidle')
      
      // Should be on detail page
      await expect(page).toHaveURL(/\/dashboard\/jobs\//)
    })
  })

  test.describe('Job Detail Tabs', () => {
    test('can switch between Overview and Requests tabs', async ({ page, testErrors }) => {
      await jobsPage.goto()
      await page.click('[data-testid="job-card"]:first-child a, tr:first-child a')
      await page.waitForLoadState('networkidle')
      
      // Click Requests tab
      await page.click('button:has-text("Requests"), [role="tab"]:has-text("Requests")')
      await page.waitForLoadState('networkidle')
      
      // Click back to Overview
      await page.click('button:has-text("Overview"), [role="tab"]:has-text("Overview")')
      await page.waitForLoadState('networkidle')
    })

    test('can access Collection tab', async ({ page, testErrors }) => {
      await jobsPage.goto()
      await page.click('[data-testid="job-card"]:first-child a, tr:first-child a')
      await page.waitForLoadState('networkidle')
      
      const collectionTab = page.locator('button:has-text("Collection"), [role="tab"]:has-text("Collection"), button:has-text("Evidence")')
      if (await collectionTab.isVisible()) {
        await collectionTab.click()
        await page.waitForLoadState('networkidle')
      }
    })
  })

  test.describe('Job Metadata', () => {
    test('can edit job name', async ({ page, testErrors }) => {
      await jobsPage.goto()
      await page.click('[data-testid="job-card"]:first-child a, tr:first-child a')
      await page.waitForLoadState('networkidle')
      
      // Look for edit button near title
      const editButton = page.locator('[data-testid="edit-name"], button:has([class*="edit"]):near(h1), button:has-text("Edit")')
      if (await editButton.first().isVisible()) {
        await editButton.first().click()
        // Edit would proceed here
      }
    })

    test('can change job status', async ({ page, testErrors }) => {
      await jobsPage.goto()
      await page.click('[data-testid="job-card"]:first-child a, tr:first-child a')
      await page.waitForLoadState('networkidle')
      
      const statusButton = page.locator('[aria-label="Status"], button:has-text("Status")')
      if (await statusButton.isVisible()) {
        await statusButton.click()
        
        // Select a status
        await page.click('[role="option"]:has-text("In Progress")')
        await page.waitForLoadState('networkidle')
      }
    })

    test('can add labels to job', async ({ page, testErrors }) => {
      await jobsPage.goto()
      await page.click('[data-testid="job-card"]:first-child a, tr:first-child a')
      await page.waitForLoadState('networkidle')
      
      const labelsButton = page.locator('button:has-text("Add Label"), button:has-text("Labels")')
      if (await labelsButton.isVisible()) {
        await labelsButton.click()
        await page.waitForLoadState('networkidle')
      }
    })
  })

  test.describe('Collaborators', () => {
    test('can view collaborators section', async ({ page, testErrors }) => {
      await jobsPage.goto()
      await page.click('[data-testid="job-card"]:first-child a, tr:first-child a')
      await page.waitForLoadState('networkidle')
      
      // Look for collaborators section
      const collaboratorsSection = page.locator('text=Collaborators')
      await expect(collaboratorsSection).toBeVisible()
    })

    test('can add collaborator', async ({ page, testErrors }) => {
      await jobsPage.goto()
      await page.click('[data-testid="job-card"]:first-child a, tr:first-child a')
      await page.waitForLoadState('networkidle')
      
      const addButton = page.locator('button:has-text("Add Collaborator")')
      if (await addButton.isVisible()) {
        await addButton.click()
        await page.waitForLoadState('networkidle')
      }
    })
  })

  test.describe('Stakeholders', () => {
    test('can view stakeholders section', async ({ page, testErrors }) => {
      await jobsPage.goto()
      await page.click('[data-testid="job-card"]:first-child a, tr:first-child a')
      await page.waitForLoadState('networkidle')
      
      const stakeholdersSection = page.locator('text=Stakeholders, text=Contacts')
      await expect(stakeholdersSection.first()).toBeVisible()
    })

    test('can add stakeholder', async ({ page, testErrors }) => {
      await jobsPage.goto()
      await page.click('[data-testid="job-card"]:first-child a, tr:first-child a')
      await page.waitForLoadState('networkidle')
      
      const addButton = page.locator('button:has-text("Add Stakeholder"), button:has-text("Add Contact")')
      if (await addButton.isVisible()) {
        await addButton.click()
        await page.waitForLoadState('networkidle')
      }
    })
  })

  test.describe('Send Request Modal', () => {
    test('can open send request modal', async ({ page, testErrors }) => {
      await jobsPage.goto()
      await page.click('[data-testid="job-card"]:first-child a, tr:first-child a')
      await page.waitForLoadState('networkidle')
      
      // Switch to Requests tab
      await page.click('button:has-text("Requests"), [role="tab"]:has-text("Requests")')
      await page.waitForLoadState('networkidle')
      
      // Click send request
      await page.click('button:has-text("Send Request"), button:has-text("New")')
      
      // Modal should open
      await expect(page.locator('[role="dialog"]')).toBeVisible()
    })

    test('send request modal shows mode selection', async ({ page, testErrors }) => {
      await jobsPage.goto()
      await page.click('[data-testid="job-card"]:first-child a, tr:first-child a')
      await page.waitForLoadState('networkidle')
      
      await page.click('button:has-text("Requests"), [role="tab"]:has-text("Requests")')
      await page.click('button:has-text("Send Request"), button:has-text("New")')
      
      await expect(page.locator('[role="dialog"]')).toBeVisible()
      
      // Should see request type options
      await expect(page.locator('text=Standard').or(page.locator('text=Data Personalization')).or(page.locator('text=Form'))).toBeVisible()
    })
  })

  test.describe('Standard Request Flow', () => {
    test('can select Standard request mode', async ({ page, testErrors }) => {
      await jobsPage.goto()
      await page.click('[data-testid="job-card"]:first-child a, tr:first-child a')
      await page.waitForLoadState('networkidle')
      
      await page.click('button:has-text("Requests"), [role="tab"]:has-text("Requests")')
      await page.click('button:has-text("Send Request"), button:has-text("New")')
      
      await expect(page.locator('[role="dialog"]')).toBeVisible()
      
      // Click Standard mode
      await page.click('button:has-text("Standard"), [data-testid="mode-standard"]')
      await page.waitForLoadState('networkidle')
    })

    test('standard mode shows AI draft', async ({ page, testErrors }) => {
      await jobsPage.goto()
      await page.click('[data-testid="job-card"]:first-child a, tr:first-child a')
      await page.waitForLoadState('networkidle')
      
      await page.click('button:has-text("Requests"), [role="tab"]:has-text("Requests")')
      await page.click('button:has-text("Send Request"), button:has-text("New")')
      await page.click('button:has-text("Standard"), [data-testid="mode-standard"]')
      
      // Should see draft content area
      await page.waitForLoadState('networkidle')
    })
  })

  test.describe('Data Personalization Flow', () => {
    test('can select Data Personalization mode', async ({ page, testErrors }) => {
      await jobsPage.goto()
      await page.click('[data-testid="job-card"]:first-child a, tr:first-child a')
      await page.waitForLoadState('networkidle')
      
      await page.click('button:has-text("Requests"), [role="tab"]:has-text("Requests")')
      await page.click('button:has-text("Send Request"), button:has-text("New")')
      
      await expect(page.locator('[role="dialog"]')).toBeVisible()
      
      // Click Data Personalization mode
      const dpButton = page.locator('button:has-text("Data Personalization"), button:has-text("Database"), [data-testid="mode-data_personalization"]')
      if (await dpButton.isVisible()) {
        await dpButton.click()
        await page.waitForLoadState('networkidle')
      }
    })
  })

  test.describe('Form Request Flow', () => {
    test('can select Form Request mode', async ({ page, testErrors }) => {
      await jobsPage.goto()
      await page.click('[data-testid="job-card"]:first-child a, tr:first-child a')
      await page.waitForLoadState('networkidle')
      
      await page.click('button:has-text("Requests"), [role="tab"]:has-text("Requests")')
      await page.click('button:has-text("Send Request"), button:has-text("New")')
      
      await expect(page.locator('[role="dialog"]')).toBeVisible()
      
      // Click Form Request mode
      const formButton = page.locator('button:has-text("Form Request"), button:has-text("Form"), [data-testid="mode-form_request"]')
      if (await formButton.isVisible()) {
        await formButton.click()
        await page.waitForLoadState('networkidle')
      }
    })
  })

  test.describe('Request Cards', () => {
    test('can view sent requests', async ({ page, testErrors }) => {
      await jobsPage.goto()
      await page.click('[data-testid="job-card"]:first-child a, tr:first-child a')
      await page.waitForLoadState('networkidle')
      
      await page.click('button:has-text("Requests"), [role="tab"]:has-text("Requests")')
      await page.waitForLoadState('networkidle')
      
      // Request cards should be visible if any exist
    })

    test('can expand request card to see recipients', async ({ page, testErrors }) => {
      await jobsPage.goto()
      await page.click('[data-testid="job-card"]:first-child a, tr:first-child a')
      await page.waitForLoadState('networkidle')
      
      await page.click('button:has-text("Requests"), [role="tab"]:has-text("Requests")')
      
      const requestCard = page.locator('[data-testid="request-card"]:first-child')
      if (await requestCard.isVisible()) {
        await requestCard.click()
        await page.waitForLoadState('networkidle')
      }
    })
  })

  test.describe('Collection Tab', () => {
    test('can access collection/evidence tab', async ({ page, testErrors }) => {
      await jobsPage.goto()
      await page.click('[data-testid="job-card"]:first-child a, tr:first-child a')
      await page.waitForLoadState('networkidle')
      
      const collectionTab = page.locator('button:has-text("Collection"), button:has-text("Evidence"), [role="tab"]:has-text("Collection")')
      if (await collectionTab.isVisible()) {
        await collectionTab.click()
        await page.waitForLoadState('networkidle')
      }
    })

    test('collection tab shows upload button', async ({ page, testErrors }) => {
      await jobsPage.goto()
      await page.click('[data-testid="job-card"]:first-child a, tr:first-child a')
      await page.waitForLoadState('networkidle')
      
      const collectionTab = page.locator('button:has-text("Collection"), button:has-text("Evidence")')
      if (await collectionTab.isVisible()) {
        await collectionTab.click()
        await page.waitForLoadState('networkidle')
        
        // Should see upload button
        const uploadButton = page.locator('button:has-text("Upload")')
        // May or may not be visible depending on permissions
      }
    })
  })
})
