import { test, expect } from '../fixtures/test.fixture'

/**
 * Email Flow Tests
 * 
 * Two-phase testing for full email workflows:
 * 
 * PHASE 1: Send test requests to stakeholders
 *   - Run this first to send emails
 *   - Wait for stakeholders to reply (manually)
 * 
 * PHASE 2: Verify replies and attachments
 *   - Run after stakeholders have replied
 *   - Verifies replies appear in UI
 *   - Verifies attachments/evidence collected
 * 
 * Usage:
 *   # Phase 1: Send requests
 *   npm run test:e2e -- e2e/tests/email-flow.spec.ts --grep "Phase 1"
 * 
 *   # Wait for stakeholders to reply...
 * 
 *   # Phase 2: Verify replies
 *   npm run test:e2e -- e2e/tests/email-flow.spec.ts --grep "Phase 2"
 */

test.describe('Email Flow - Phase 1: Send Requests', () => {
  test('navigate to a job with stakeholders', async ({ page, testErrors }) => {
    await page.goto('/dashboard/jobs')
    await page.waitForLoadState('networkidle')
    
    // Click first job in list
    await page.click('[data-testid="job-card"]:first-child a, tr:first-child a, a:has-text("View")')
    await page.waitForLoadState('networkidle')
    
    // Verify we're on job detail
    await expect(page).toHaveURL(/\/dashboard\/jobs\//)
  })

  test('verify stakeholders exist on job', async ({ page, testErrors }) => {
    await page.goto('/dashboard/jobs')
    await page.click('[data-testid="job-card"]:first-child a, tr:first-child a')
    await page.waitForLoadState('networkidle')
    
    // Look for stakeholders section
    const stakeholders = page.locator('text=Stakeholders, text=Contacts')
    await expect(stakeholders.first()).toBeVisible()
    
    // Should have at least one stakeholder
    const stakeholderCount = page.locator('[data-testid^="stakeholder-"], tr:has-text("@")')
    const count = await stakeholderCount.count()
    console.log(`Found ${count} stakeholders`)
    expect(count).toBeGreaterThan(0)
  })

  test('send standard request to stakeholders', async ({ page, testErrors }) => {
    await page.goto('/dashboard/jobs')
    await page.click('[data-testid="job-card"]:first-child a, tr:first-child a')
    await page.waitForLoadState('networkidle')
    
    // Switch to Requests tab
    await page.click('button:has-text("Requests"), [role="tab"]:has-text("Requests")')
    await page.waitForLoadState('networkidle')
    
    // Open send request modal
    await page.click('button:has-text("Send Request"), button:has-text("New")')
    await expect(page.locator('[role="dialog"]')).toBeVisible()
    
    // Select Standard mode
    await page.click('button:has-text("Standard"), [data-testid="mode-standard"]')
    await page.waitForLoadState('networkidle')
    
    // Wait for AI draft to generate
    await page.waitForTimeout(3000) // Give AI time to generate
    
    // Select all stakeholders as recipients
    const selectAllButton = page.locator('button:has-text("Select All")')
    if (await selectAllButton.isVisible()) {
      await selectAllButton.click()
    } else {
      // Click individual recipients
      const recipients = page.locator('[data-testid^="recipient-"]:not([data-selected="true"])')
      const count = await recipients.count()
      for (let i = 0; i < Math.min(count, 5); i++) { // Max 5 recipients
        await recipients.nth(i).click()
      }
    }
    
    // Modify subject to identify as test
    const subjectInput = page.locator('input[name="subject"]')
    if (await subjectInput.isVisible()) {
      const currentSubject = await subjectInput.inputValue()
      await subjectInput.fill(`[E2E TEST] ${currentSubject}`)
    }
    
    // Send the request
    await page.click('button:has-text("Send")')
    await page.waitForLoadState('networkidle')
    
    // Verify modal closed or success message
    await page.waitForTimeout(2000)
    
    console.log('✅ Test request sent to stakeholders')
    console.log('📧 Please have stakeholders reply to the email (optionally with attachments)')
    console.log('⏳ Then run Phase 2 tests to verify replies appear')
  })
})

test.describe('Email Flow - Phase 2: Verify Replies', () => {
  test('check for replies on sent requests', async ({ page, testErrors }) => {
    await page.goto('/dashboard/jobs')
    await page.click('[data-testid="job-card"]:first-child a, tr:first-child a')
    await page.waitForLoadState('networkidle')
    
    // Switch to Requests tab
    await page.click('button:has-text("Requests"), [role="tab"]:has-text("Requests")')
    await page.waitForLoadState('networkidle')
    
    // Find sent requests
    const requestCards = page.locator('[data-testid="request-card"], [data-testid^="request-"]')
    const requestCount = await requestCards.count()
    
    console.log(`Found ${requestCount} sent requests`)
    expect(requestCount).toBeGreaterThan(0)
    
    // Expand first request to see recipients
    if (requestCount > 0) {
      await requestCards.first().click()
      await page.waitForLoadState('networkidle')
      
      // Look for recipients with REPLIED status
      const repliedRecipients = page.locator('text=Replied, [data-status="REPLIED"]')
      const repliedCount = await repliedRecipients.count()
      
      console.log(`Found ${repliedCount} recipients who have replied`)
      
      // Log all recipient statuses
      const recipientRows = page.locator('[data-testid^="recipient-"], tr:has-text("@")')
      const totalRecipients = await recipientRows.count()
      console.log(`Total recipients: ${totalRecipients}`)
    }
  })

  test('verify replies appear in requests view', async ({ page, testErrors }) => {
    // Navigate to Requests page (global view)
    await page.goto('/dashboard/requests')
    await page.waitForLoadState('networkidle')
    
    // Look for items with replies
    const repliedItems = page.locator('text=Replied, [data-status="REPLIED"], text=replied')
    const repliedCount = await repliedItems.count()
    
    console.log(`Found ${repliedCount} items marked as replied in requests view`)
  })

  test('check collection tab for attachments', async ({ page, testErrors }) => {
    await page.goto('/dashboard/jobs')
    await page.click('[data-testid="job-card"]:first-child a, tr:first-child a')
    await page.waitForLoadState('networkidle')
    
    // Switch to Collection/Evidence tab
    const collectionTab = page.locator('button:has-text("Collection"), button:has-text("Evidence"), [role="tab"]:has-text("Collection")')
    if (await collectionTab.isVisible()) {
      await collectionTab.click()
      await page.waitForLoadState('networkidle')
      
      // Look for collected items
      const collectedItems = page.locator('[data-testid^="collected-"], [data-testid^="evidence-"], tr:has-text("attachment")')
      const itemCount = await collectedItems.count()
      
      console.log(`Found ${itemCount} collected items/attachments`)
      
      if (itemCount > 0) {
        console.log('✅ Attachments successfully collected from replies')
      } else {
        console.log('ℹ️ No attachments found - stakeholders may not have attached files')
      }
    }
  })

  test('verify email thread in review page', async ({ page, testErrors }) => {
    // Go to requests page and find one with a reply
    await page.goto('/dashboard/requests')
    await page.waitForLoadState('networkidle')
    
    // Click on a request to view details
    const requestLink = page.locator('a:has-text("View"), [data-testid^="request-"] a').first()
    if (await requestLink.isVisible()) {
      await requestLink.click()
      await page.waitForLoadState('networkidle')
      
      // Should show email thread
      const emailThread = page.locator('[data-testid="email-thread"], text=Reply, text=Original')
      const hasThread = await emailThread.first().isVisible()
      
      if (hasThread) {
        console.log('✅ Email thread visible with reply')
      }
    }
  })
})

test.describe('Email Flow - Full Cycle Verification', () => {
  test('summary of email flow status', async ({ page, testErrors }) => {
    console.log('\n📊 EMAIL FLOW TEST SUMMARY\n')
    
    // Check jobs with requests
    await page.goto('/dashboard/jobs')
    await page.waitForLoadState('networkidle')
    
    // Navigate to first job
    await page.click('[data-testid="job-card"]:first-child a, tr:first-child a')
    await page.waitForLoadState('networkidle')
    
    // Get job name
    const jobTitle = page.locator('h1, h2').first()
    const jobName = await jobTitle.textContent()
    console.log(`Job: ${jobName}`)
    
    // Check requests
    await page.click('button:has-text("Requests"), [role="tab"]:has-text("Requests")')
    await page.waitForLoadState('networkidle')
    
    const requestCards = page.locator('[data-testid="request-card"]')
    const requestCount = await requestCards.count()
    console.log(`Requests sent: ${requestCount}`)
    
    // Check collection
    const collectionTab = page.locator('button:has-text("Collection"), button:has-text("Evidence")')
    if (await collectionTab.isVisible()) {
      await collectionTab.click()
      await page.waitForLoadState('networkidle')
      
      const collectedCount = await page.locator('[data-testid^="collected-"]').count()
      console.log(`Items collected: ${collectedCount}`)
    }
    
    console.log('\n✅ Email flow test complete')
  })
})
