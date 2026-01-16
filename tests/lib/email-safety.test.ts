/**
 * Email Safety Tests
 * 
 * Tests for P0 email safety controls:
 * - Kill switch (EMAIL_SENDING_ENABLED)
 * - Max recipients cap (MAX_EMAILS_PER_SEND)
 * - Dry-run mode (EMAIL_DRY_RUN)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the external dependencies
vi.mock('@/lib/prisma', () => ({
  prisma: {
    connectedEmailAccount: {
      findFirst: vi.fn()
    },
    emailSendAudit: {
      create: vi.fn()
    }
  }
}))

vi.mock('@/lib/services/email-connection.service', () => ({
  EmailConnectionService: {
    getPrimaryAccount: vi.fn(),
    getGmailClient: vi.fn(),
    getDecryptedCredentials: vi.fn()
  }
}))

vi.mock('@/lib/services/email-account.service', () => ({
  EmailAccountService: {
    getById: vi.fn(),
    getFirstActive: vi.fn()
  }
}))

vi.mock('@/lib/services/task-creation.service', () => ({
  TaskCreationService: {
    createTaskFromEmail: vi.fn(),
    logOutboundMessage: vi.fn()
  }
}))

vi.mock('@/lib/services/token-refresh.service', () => ({
  TokenRefreshService: {
    ensureValidToken: vi.fn()
  }
}))

vi.mock('@/lib/services/tracking-pixel.service', () => ({
  TrackingPixelService: {
    generateTrackingToken: vi.fn().mockReturnValue('test-token'),
    generateTrackingUrl: vi.fn().mockReturnValue('http://test.com/track'),
    injectTrackingPixel: vi.fn((html) => html)
  }
}))

vi.mock('@/lib/services/reminder-state.service', () => ({
  ReminderStateService: {
    initializeForTask: vi.fn()
  }
}))

vi.mock('@/lib/providers/email/gmail-provider', () => ({
  GmailProvider: vi.fn().mockImplementation(() => ({
    sendEmail: vi.fn().mockResolvedValue({ messageId: 'test-msg-id', providerData: {} })
  }))
}))

vi.mock('@/lib/providers/email/microsoft-provider', () => ({
  MicrosoftProvider: vi.fn().mockImplementation(() => ({
    sendEmail: vi.fn().mockResolvedValue({ messageId: 'test-msg-id', providerData: {} })
  }))
}))

vi.mock('googleapis', () => ({
  google: {
    gmail: vi.fn()
  }
}))

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn()
  }
}))

describe('Email Safety Controls', () => {
  const originalEnv = process.env

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv }
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('EMAIL_SENDING_ENABLED kill switch', () => {
    it('should block email sending when EMAIL_SENDING_ENABLED=false', async () => {
      process.env.EMAIL_SENDING_ENABLED = 'false'
      
      // Re-import to pick up new env
      const { EmailSendingService } = await import('@/lib/services/email-sending.service')
      
      await expect(
        EmailSendingService.sendEmail({
          organizationId: 'test-org',
          to: 'test@example.com',
          subject: 'Test',
          body: 'Test body'
        })
      ).rejects.toThrow('Email sending is currently disabled')
    })

    it('should allow email sending when EMAIL_SENDING_ENABLED is not set', async () => {
      delete process.env.EMAIL_SENDING_ENABLED
      
      // This test would need more mocking to fully work
      // For now, we verify the function doesn't throw immediately
      const { EmailSendingService } = await import('@/lib/services/email-sending.service')
      
      // The function will fail later due to missing account, but not due to kill switch
      await expect(
        EmailSendingService.sendEmail({
          organizationId: 'test-org',
          to: 'test@example.com',
          subject: 'Test',
          body: 'Test body'
        })
      ).rejects.toThrow('No active email account found')
    })

    it('should allow email sending when EMAIL_SENDING_ENABLED=true', async () => {
      process.env.EMAIL_SENDING_ENABLED = 'true'
      
      const { EmailSendingService } = await import('@/lib/services/email-sending.service')
      
      // The function will fail later due to missing account, but not due to kill switch
      await expect(
        EmailSendingService.sendEmail({
          organizationId: 'test-org',
          to: 'test@example.com',
          subject: 'Test',
          body: 'Test body'
        })
      ).rejects.toThrow('No active email account found')
    })
  })

  describe('EMAIL_DRY_RUN mode', () => {
    it('should return mock result when EMAIL_DRY_RUN=true', async () => {
      process.env.EMAIL_DRY_RUN = 'true'
      delete process.env.EMAIL_SENDING_ENABLED
      
      const { EmailSendingService } = await import('@/lib/services/email-sending.service')
      
      const result = await EmailSendingService.sendEmail({
        organizationId: 'test-org',
        to: 'test@example.com',
        subject: 'Test',
        body: 'Test body'
      })
      
      expect(result.taskId).toMatch(/^dry-run-/)
      expect(result.threadId).toMatch(/^dry-run-thread-/)
      expect(result.messageId).toMatch(/^dry-run-msg-/)
    })
  })

  describe('MAX_EMAILS_PER_SEND cap', () => {
    it('should reject bulk sends exceeding MAX_EMAILS_PER_SEND', async () => {
      process.env.MAX_EMAILS_PER_SEND = '5'
      delete process.env.EMAIL_SENDING_ENABLED
      
      const { EmailSendingService } = await import('@/lib/services/email-sending.service')
      
      const recipients = Array.from({ length: 10 }, (_, i) => ({
        email: `test${i}@example.com`,
        name: `Test ${i}`
      }))
      
      await expect(
        EmailSendingService.sendBulkEmail({
          organizationId: 'test-org',
          recipients,
          subject: 'Test',
          body: 'Test body'
        })
      ).rejects.toThrow('Cannot send to more than 5 recipients')
    })

    it('should allow bulk sends within MAX_EMAILS_PER_SEND limit', async () => {
      process.env.MAX_EMAILS_PER_SEND = '10'
      process.env.EMAIL_DRY_RUN = 'true' // Use dry-run to avoid needing full email setup
      delete process.env.EMAIL_SENDING_ENABLED
      
      const { EmailSendingService } = await import('@/lib/services/email-sending.service')
      
      const recipients = Array.from({ length: 5 }, (_, i) => ({
        email: `test${i}@example.com`,
        name: `Test ${i}`
      }))
      
      const results = await EmailSendingService.sendBulkEmail({
        organizationId: 'test-org',
        recipients,
        subject: 'Test',
        body: 'Test body'
      })
      
      expect(results).toHaveLength(5)
      results.forEach(result => {
        expect(result.taskId).toMatch(/^dry-run-/)
      })
    })

    it('should default to 50 recipients when MAX_EMAILS_PER_SEND is not set', async () => {
      delete process.env.MAX_EMAILS_PER_SEND
      delete process.env.EMAIL_SENDING_ENABLED
      
      const { EmailSendingService } = await import('@/lib/services/email-sending.service')
      
      const recipients = Array.from({ length: 51 }, (_, i) => ({
        email: `test${i}@example.com`,
        name: `Test ${i}`
      }))
      
      await expect(
        EmailSendingService.sendBulkEmail({
          organizationId: 'test-org',
          recipients,
          subject: 'Test',
          body: 'Test body'
        })
      ).rejects.toThrow('Cannot send to more than 50 recipients')
    })
  })
})
