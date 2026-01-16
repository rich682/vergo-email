/**
 * Email Safety Tests
 * 
 * Tests for email safety controls:
 * - Per-recipient rate limiting (max 1 email per 24 hours)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the external dependencies
const mockPrisma = {
  connectedEmailAccount: {
    findFirst: vi.fn()
  },
  emailSendAudit: {
    create: vi.fn(),
    findFirst: vi.fn()
  }
}

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma
}))

vi.mock('@/lib/services/email-connection.service', () => ({
  EmailConnectionService: {
    getPrimaryAccount: vi.fn(),
    getById: vi.fn(),
    getFirstActive: vi.fn(),
    getGmailClient: vi.fn(),
    getDecryptedCredentials: vi.fn()
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
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Per-recipient rate limiting', () => {
    it('should block email if recipient was emailed within 24 hours', async () => {
      // Mock a recent successful send
      const recentSendTime = new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
      mockPrisma.emailSendAudit.findFirst.mockResolvedValue({
        id: 'audit-1',
        toEmail: 'test@example.com',
        result: 'SUCCESS',
        createdAt: recentSendTime
      })
      
      const { EmailSendingService } = await import('@/lib/services/email-sending.service')
      
      await expect(
        EmailSendingService.sendEmail({
          organizationId: 'test-org',
          to: 'test@example.com',
          subject: 'Test',
          body: 'Test body'
        })
      ).rejects.toThrow('Cannot send to test@example.com - already emailed within the last 24 hours')
    })

    it('should allow email if recipient was not emailed within 24 hours', async () => {
      // Mock no recent sends
      mockPrisma.emailSendAudit.findFirst.mockResolvedValue(null)
      
      const { EmailSendingService } = await import('@/lib/services/email-sending.service')
      
      // The function will fail later due to missing account, but not due to rate limit
      await expect(
        EmailSendingService.sendEmail({
          organizationId: 'test-org',
          to: 'test@example.com',
          subject: 'Test',
          body: 'Test body'
        })
      ).rejects.toThrow('No active email account found')
    })

    it('should allow email if last send was more than 24 hours ago', async () => {
      // Mock an old send (25 hours ago)
      const oldSendTime = new Date(Date.now() - 25 * 60 * 60 * 1000)
      mockPrisma.emailSendAudit.findFirst.mockResolvedValue(null) // findFirst with gte filter returns null
      
      const { EmailSendingService } = await import('@/lib/services/email-sending.service')
      
      // The function will fail later due to missing account, but not due to rate limit
      await expect(
        EmailSendingService.sendEmail({
          organizationId: 'test-org',
          to: 'test@example.com',
          subject: 'Test',
          body: 'Test body'
        })
      ).rejects.toThrow('No active email account found')
    })

    it('should allow email with skipRateLimit flag', async () => {
      // Mock a recent successful send
      mockPrisma.emailSendAudit.findFirst.mockResolvedValue({
        id: 'audit-1',
        toEmail: 'test@example.com',
        result: 'SUCCESS',
        createdAt: new Date()
      })
      
      const { EmailSendingService } = await import('@/lib/services/email-sending.service')
      
      // With skipRateLimit, should not check rate limit
      // Will fail due to missing account, not rate limit
      await expect(
        EmailSendingService.sendEmail({
          organizationId: 'test-org',
          to: 'test@example.com',
          subject: 'Test',
          body: 'Test body',
          skipRateLimit: true
        })
      ).rejects.toThrow('No active email account found')
    })

    it('should fail open if rate limit check errors', async () => {
      // Mock database error
      mockPrisma.emailSendAudit.findFirst.mockRejectedValue(new Error('Database error'))
      
      const { EmailSendingService } = await import('@/lib/services/email-sending.service')
      
      // Should proceed (fail open) and fail due to missing account
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

  describe('Reminders bypass rate limiting', () => {
    it('should allow reminder emails regardless of recent sends', async () => {
      // sendEmailForExistingTask is used for reminders and bypasses rate limiting
      // This is intentional - reminders have their own frequency controls
      
      const { EmailSendingService } = await import('@/lib/services/email-sending.service')
      
      // Will fail due to missing account, but should not check rate limit
      await expect(
        EmailSendingService.sendEmailForExistingTask({
          taskId: 'task-1',
          entityId: 'entity-1',
          organizationId: 'test-org',
          to: 'test@example.com',
          subject: 'Reminder',
          body: 'Reminder body'
        })
      ).rejects.toThrow('No active email account found')
      
      // Verify rate limit was NOT checked
      expect(mockPrisma.emailSendAudit.findFirst).not.toHaveBeenCalled()
    })
  })
})
