import { prisma } from "@/lib/prisma"
import { EmailQueueStatus } from "@prisma/client"
import { logger } from "@/lib/logger"

const log = logger.child({ service: "EmailQueueService" })

// How long to wait before retrying a rate-limited email (in hours)
// This should be slightly longer than the rate limit window to ensure the limit has reset
const RETRY_DELAY_HOURS = 24

export interface QueuedEmailData {
  organizationId: string
  userId?: string | null
  jobId?: string | null
  taskId?: string | null
  toEmail: string
  subject: string
  body: string
  htmlBody?: string
  accountId?: string
  metadata?: Record<string, any>
}

export class EmailQueueService {
  /**
   * Add an email to the queue for later sending
   * Called when an email is rate-limited
   */
  static async enqueue(data: QueuedEmailData): Promise<string> {
    const nextAttemptAt = new Date(Date.now() + RETRY_DELAY_HOURS * 60 * 60 * 1000)
    
    const queued = await prisma.emailQueue.create({
      data: {
        organizationId: data.organizationId,
        userId: data.userId,
        taskInstanceId: data.jobId,
        requestId: data.taskId,
        toEmail: data.toEmail.toLowerCase(),
        subject: data.subject,
        body: data.body,
        htmlBody: data.htmlBody,
        accountId: data.accountId,
        status: EmailQueueStatus.PENDING,
        nextAttemptAt,
        metadata: data.metadata ?? undefined,
      }
    })
    
    log.info("Email queued for later sending", {
      queueId: queued.id,
      toEmail: data.toEmail,
      nextAttemptAt,
    }, { organizationId: data.organizationId, operation: "enqueue" })
    
    return queued.id
  }
  
  /**
   * Get pending emails that are ready to be processed
   * Returns emails where nextAttemptAt <= now and status is PENDING
   */
  static async getPendingEmails(limit: number = 50) {
    const now = new Date()
    
    const emails = await prisma.emailQueue.findMany({
      where: {
        status: EmailQueueStatus.PENDING,
        nextAttemptAt: { lte: now }
      },
      orderBy: [
        { priority: "desc" },
        { createdAt: "asc" }
      ],
      take: limit
    })
    
    return emails
  }
  
  /**
   * Mark an email as being processed (to prevent duplicate processing)
   */
  static async markProcessing(id: string): Promise<boolean> {
    try {
      await prisma.emailQueue.update({
        where: { 
          id,
          status: EmailQueueStatus.PENDING  // Only update if still pending
        },
        data: {
          status: EmailQueueStatus.PROCESSING,
          lastAttemptAt: new Date(),
          attempts: { increment: 1 }
        }
      })
      return true
    } catch (error) {
      // Record may have been updated by another worker
      log.warn("Failed to mark email as processing (may be processed by another worker)", {
        queueId: id,
        error: (error as Error).message
      }, { operation: "markProcessing" })
      return false
    }
  }
  
  /**
   * Mark an email as successfully sent
   */
  static async markSent(id: string): Promise<void> {
    await prisma.emailQueue.update({
      where: { id },
      data: {
        status: EmailQueueStatus.SENT
      }
    })
    
    log.info("Queued email sent successfully", { queueId: id }, { operation: "markSent" })
  }
  
  /**
   * Mark an email as failed and schedule retry if attempts remain
   */
  static async markFailed(id: string, error: string): Promise<void> {
    const email = await prisma.emailQueue.findUnique({
      where: { id },
      select: { attempts: true, maxAttempts: true }
    })
    
    if (!email) return
    
    if (email.attempts >= email.maxAttempts) {
      // Max attempts reached, mark as permanently failed
      await prisma.emailQueue.update({
        where: { id },
        data: {
          status: EmailQueueStatus.FAILED,
          lastError: error
        }
      })
      
      log.error("Queued email permanently failed after max attempts", {
        queueId: id,
        attempts: email.attempts,
        error
      }, { operation: "markFailed" })
    } else {
      // Schedule retry with exponential backoff
      const backoffHours = Math.pow(2, email.attempts) * RETRY_DELAY_HOURS
      const nextAttemptAt = new Date(Date.now() + backoffHours * 60 * 60 * 1000)
      
      await prisma.emailQueue.update({
        where: { id },
        data: {
          status: EmailQueueStatus.PENDING,
          lastError: error,
          nextAttemptAt
        }
      })
      
      log.info("Queued email scheduled for retry", {
        queueId: id,
        attempts: email.attempts,
        nextAttemptAt,
        error
      }, { operation: "markFailed" })
    }
  }
  
  /**
   * Cancel a queued email
   */
  static async cancel(id: string, organizationId: string): Promise<boolean> {
    try {
      await prisma.emailQueue.update({
        where: { 
          id,
          organizationId  // Ensure org scoping
        },
        data: {
          status: EmailQueueStatus.CANCELLED
        }
      })
      
      log.info("Queued email cancelled", { queueId: id }, { organizationId, operation: "cancel" })
      return true
    } catch (error) {
      return false
    }
  }
  
  /**
   * Get queue status for an organization
   */
  static async getQueueStatus(organizationId: string): Promise<{
    pending: number
    processing: number
    sent: number
    failed: number
  }> {
    const [pending, processing, sent, failed] = await Promise.all([
      prisma.emailQueue.count({ where: { organizationId, status: EmailQueueStatus.PENDING } }),
      prisma.emailQueue.count({ where: { organizationId, status: EmailQueueStatus.PROCESSING } }),
      prisma.emailQueue.count({ where: { organizationId, status: EmailQueueStatus.SENT } }),
      prisma.emailQueue.count({ where: { organizationId, status: EmailQueueStatus.FAILED } }),
    ])
    
    return { pending, processing, sent, failed }
  }
  
  /**
   * Get queued emails for an organization (for UI display)
   */
  static async getQueuedEmails(organizationId: string, status?: EmailQueueStatus): Promise<Array<{
    id: string
    toEmail: string
    subject: string
    status: EmailQueueStatus
    attempts: number
    nextAttemptAt: Date
    lastError: string | null
    createdAt: Date
  }>> {
    return prisma.emailQueue.findMany({
      where: {
        organizationId,
        ...(status ? { status } : {})
      },
      select: {
        id: true,
        toEmail: true,
        subject: true,
        status: true,
        attempts: true,
        nextAttemptAt: true,
        lastError: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" },
      take: 100
    })
  }
}
