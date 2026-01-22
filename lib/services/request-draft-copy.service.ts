/**
 * RequestDraftCopyService - Handles copying requests as drafts during period rollover.
 * 
 * Implements copy-on-write pattern:
 * - Only draftSourceRequestId is stored at draft creation (no content duplication)
 * - Content is read from source request's first outbound message
 * - draftEditedSubject/Body/HtmlBody only populated if user edits
 */

import { prisma } from "@/lib/prisma"
import { Request, Message } from "@prisma/client"
import { v4 as uuidv4 } from "uuid"
import { BusinessDayService, ScheduleConfig } from "./business-day.service"

type RequestWithMessages = Request & {
  messages: Message[]
}

interface CopyRequestsAsDraftsParams {
  previousTaskInstanceId: string
  newTaskInstanceId: string
  newBoardId: string
  organizationId: string
  previousRequests: RequestWithMessages[]
}

interface DraftContent {
  subject: string | null
  body: string | null
  htmlBody: string | null
}

export class RequestDraftCopyService {
  /**
   * Generate a new thread ID for a draft request.
   */
  static generateThreadId(): string {
    return uuidv4()
  }

  /**
   * Copy requests from a previous task instance as drafts to a new task instance.
   * Called during board/period rollover when spawning task instances for the next period.
   * 
   * Key behaviors:
   * - Only copies requests that have an outbound message (i.e., were actually sent)
   * - Uses copy-on-write pattern: no content duplication, only stores reference
   * - Sets isDraft=true, remindersApproved=false
   * - Recomputes scheduledSendAt for period-aware requests (if new board has period dates)
   * - Idempotent: skips if draft already exists for this source request
   */
  static async copyRequestsAsDrafts(params: CopyRequestsAsDraftsParams): Promise<number> {
    const {
      newTaskInstanceId,
      newBoardId,
      organizationId,
      previousRequests
    } = params

    let copiedCount = 0

    // Get new board for period-aware date recomputation
    const newBoard = await prisma.board.findUnique({
      where: { id: newBoardId },
      select: { periodStart: true, periodEnd: true }
    })

    for (const prevRequest of previousRequests) {
      // Skip if no outbound message (never sent)
      const originalMessage = prevRequest.messages.find(m => m.direction === "OUTBOUND")
      if (!originalMessage) {
        continue
      }

      // Idempotency check: skip if draft already exists for this source
      const existingDraft = await prisma.request.findFirst({
        where: {
          taskInstanceId: newTaskInstanceId,
          draftSourceRequestId: prevRequest.id
        }
      })
      if (existingDraft) {
        continue
      }

      // Parse schedule config from source request
      const scheduleConfig = prevRequest.scheduleConfig as ScheduleConfig | null

      // Recompute scheduledSendAt for period-aware requests
      let scheduledSendAt: Date | null = null
      if (scheduleConfig?.mode === "period_aware" && newBoard) {
        scheduledSendAt = BusinessDayService.computeFromConfig(
          scheduleConfig,
          newBoard.periodStart,
          newBoard.periodEnd
        )
      }

      // Create draft request (copy-on-write: NO content duplication)
      const newThreadId = this.generateThreadId()

      await prisma.request.create({
        data: {
          organizationId,
          taskInstanceId: newTaskInstanceId,
          entityId: prevRequest.entityId, // Copied as-is - user must review

          // Draft fields - only store reference, not content
          isDraft: true,
          draftSourceRequestId: prevRequest.id,
          // draftEditedSubject/Body/HtmlBody: null (copy-on-write)

          // Copy configuration
          campaignName: prevRequest.campaignName,
          campaignType: prevRequest.campaignType,
          threadId: newThreadId,
          status: "NO_REPLY", // isDraft=true is authoritative

          // Copy scheduling config (JSON blob)
          scheduleConfig: scheduleConfig as any,
          scheduledSendAt,

          // Copy reminder config (NOT approved - user must re-approve)
          remindersEnabled: prevRequest.remindersEnabled,
          remindersStartDelayHours: prevRequest.remindersStartDelayHours,
          remindersFrequencyHours: prevRequest.remindersFrequencyHours,
          remindersMaxCount: prevRequest.remindersMaxCount,
          remindersApproved: false, // User must re-approve

          // Deadline will be set from scheduledSendAt or manually
          deadlineDate: scheduledSendAt
        }
      })

      copiedCount++
    }

    return copiedCount
  }

  /**
   * Resolve draft content using copy-on-write pattern.
   * Returns edited content if available, otherwise source message content.
   * 
   * @param request - The draft request (must have isDraft=true)
   * @returns Resolved content { subject, body, htmlBody }
   */
  static async resolveDraftContent(request: Request): Promise<DraftContent> {
    // Type assertion for new fields (may not be in generated types yet)
    const r = request as Request & {
      draftEditedSubject?: string | null
      draftEditedBody?: string | null
      draftEditedHtmlBody?: string | null
      draftSourceRequestId?: string | null
    }

    // If user has edited, use edited values
    if (r.draftEditedSubject || r.draftEditedBody || r.draftEditedHtmlBody) {
      return {
        subject: r.draftEditedSubject ?? null,
        body: r.draftEditedBody ?? null,
        htmlBody: r.draftEditedHtmlBody ?? null
      }
    }

    // Otherwise, read from source request's first outbound message
    if (r.draftSourceRequestId) {
      const sourceMessage = await prisma.message.findFirst({
        where: {
          requestId: r.draftSourceRequestId,
          direction: "OUTBOUND"
        },
        orderBy: { createdAt: "asc" },
        select: {
          subject: true,
          body: true,
          htmlBody: true
        }
      })

      if (sourceMessage) {
        return {
          subject: sourceMessage.subject,
          body: sourceMessage.body,
          htmlBody: sourceMessage.htmlBody
        }
      }
    }

    return { subject: null, body: null, htmlBody: null }
  }

  /**
   * Update a draft request with edited content.
   * Called when user modifies the draft content before sending.
   * 
   * @param requestId - The draft request ID
   * @param organizationId - Organization ID for security
   * @param edits - The edited content
   */
  static async updateDraftContent(
    requestId: string,
    organizationId: string,
    edits: {
      subject?: string
      body?: string
      htmlBody?: string
    }
  ): Promise<Request> {
    return prisma.request.update({
      where: { id: requestId, organizationId },
      data: {
        draftEditedSubject: edits.subject,
        draftEditedBody: edits.body,
        draftEditedHtmlBody: edits.htmlBody
      }
    })
  }

  /**
   * Activate a draft request (convert to active request and send).
   * Called when user clicks "Send" on a draft.
   * 
   * This method:
   * - Sets isDraft = false
   * - Does NOT send the email (caller should use EmailSendingService)
   * - Returns the updated request
   * 
   * @param requestId - The draft request ID
   * @param organizationId - Organization ID for security
   */
  static async activateDraft(
    requestId: string,
    organizationId: string
  ): Promise<Request> {
    return prisma.request.update({
      where: { id: requestId, organizationId, isDraft: true },
      data: {
        isDraft: false
      }
    })
  }

  /**
   * Delete a draft request.
   * Only drafts can be deleted via this method.
   * 
   * @param requestId - The draft request ID
   * @param organizationId - Organization ID for security
   */
  static async deleteDraft(
    requestId: string,
    organizationId: string
  ): Promise<boolean> {
    const result = await prisma.request.deleteMany({
      where: {
        id: requestId,
        organizationId,
        isDraft: true
      }
    })
    return result.count > 0
  }

  /**
   * Get all draft requests for a task instance.
   * 
   * @param taskInstanceId - The task instance ID
   * @param organizationId - Organization ID for security
   */
  static async getDraftsForTaskInstance(
    taskInstanceId: string,
    organizationId: string
  ): Promise<Request[]> {
    return prisma.request.findMany({
      where: {
        taskInstanceId,
        organizationId,
        isDraft: true
      },
      include: {
        entity: true
      }
    })
  }

  /**
   * Check if a task instance has any draft requests.
   * Useful for showing "Draft request" badge in UI.
   * 
   * @param taskInstanceId - The task instance ID
   * @param organizationId - Organization ID for security
   */
  static async hasDrafts(
    taskInstanceId: string,
    organizationId: string
  ): Promise<boolean> {
    const count = await prisma.request.count({
      where: {
        taskInstanceId,
        organizationId,
        isDraft: true
      }
    })
    return count > 0
  }
}
