/**
 * Job Requests API Endpoint
 * 
 * GET /api/task-instances/[id]/requests - Get EmailDrafts (Requests) associated with a Job
 *   Query params:
 *   - includeDrafts=true|false (default: false) - Include draft requests in response
 * 
 * POST /api/task-instances/[id]/requests - Draft operations
 *   Body: { requestId?: string, action: "send" | "update" | "create_draft", ...actionParams }
 *   - action: "create_draft" - Create a new draft request (for scheduled sending)
 *   - action: "send" - Send a draft request (activates it)
 *   - action: "update" - Update draft content
 * 
 * DELETE /api/task-instances/[id]/requests - Delete a draft request
 *   Body: { requestId: string }
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TaskInstanceService } from "@/lib/services/task-instance.service"
import { RequestDraftCopyService } from "@/lib/services/request-draft-copy.service"
import { EmailSendingService } from "@/lib/services/email-sending.service"
import { RequestCreationService } from "@/lib/services/request-creation.service"
import { ReminderStateService } from "@/lib/services/reminder-state.service"
import { BusinessDayService, ScheduleConfig } from "@/lib/services/business-day.service"
import { TrackingPixelService } from "@/lib/services/tracking-pixel.service"
import { UserRole, EmailProvider } from "@prisma/client"
import { GmailProvider } from "@/lib/providers/email/gmail-provider"
import { MicrosoftProvider } from "@/lib/providers/email/microsoft-provider"
import { EmailConnectionService } from "@/lib/services/email-connection.service"

export const dynamic = 'force-dynamic'

/**
 * GET - Get requests for a task instance
 * Query params:
 * - includeDrafts=true|false (default: false)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = (session.user as any).role as UserRole || UserRole.MEMBER
    const { id: taskInstanceId } = await params

    // Parse query params
    const { searchParams } = new URL(request.url)
    const includeDrafts = searchParams.get("includeDrafts") === "true"

    // Verify task instance exists and user has access
    const instance = await TaskInstanceService.findById(taskInstanceId, organizationId)
    if (!instance) {
      return NextResponse.json(
        { error: "Task instance not found" },
        { status: 404 }
      )
    }

    // Check view permission
    const canView = await TaskInstanceService.canUserAccess(userId, userRole, instance, 'view')
    if (!canView) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      )
    }

    // Fetch EmailDrafts for this task instance
    const emailDrafts = await prisma.emailDraft.findMany({
      where: {
        taskInstanceId,
        organizationId
      },
      select: {
        id: true,
        prompt: true,
        generatedSubject: true,
        generatedBody: true,
        generatedHtmlBody: true,
        subjectTemplate: true,
        bodyTemplate: true,
        htmlBodyTemplate: true,
        status: true,
        sentAt: true,
        createdAt: true,
        updatedAt: true,
        deadlineDate: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    })

    // Get requests directly by taskInstanceId (exclude drafts for this endpoint)
    const requests = await prisma.request.findMany({
      where: {
        organizationId,
        taskInstanceId,
        isDraft: false
      },
      select: {
        id: true,
        status: true,
        readStatus: true,
        remindersEnabled: true,
        remindersFrequencyHours: true,
        remindersMaxCount: true,
        createdAt: true,
        entity: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        messages: {
          where: { direction: "OUTBOUND" },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: {
            id: true,
            subject: true,
            body: true,
            createdAt: true
          }
        }
      }
    })

    // Match requests to emailDrafts by creation time proximity
    const enrichedRequests = emailDrafts.map(draft => {
      let matchedRequests: typeof requests = []

      if (draft.sentAt) {
        const sentTime = new Date(draft.sentAt).getTime()
        matchedRequests = requests.filter(req => {
          const reqTime = new Date(req.createdAt).getTime()
          return Math.abs(reqTime - sentTime) < 5 * 60 * 1000
        })
      }

      const firstReq = matchedRequests[0]
      const reminderConfig = firstReq ? {
        enabled: firstReq.remindersEnabled,
        frequencyHours: firstReq.remindersFrequencyHours,
        maxCount: firstReq.remindersMaxCount
      } : null

      return {
        ...draft,
        taskCount: matchedRequests.length,
        reminderConfig,
        recipients: matchedRequests.map(req => ({
          id: req.id,
          entityId: req.entity?.id,
          name: req.entity ? `${req.entity.firstName}${req.entity.lastName ? ` ${req.entity.lastName}` : ''}` : 'Unknown',
          email: req.entity?.email || 'Unknown',
          status: req.status,
          readStatus: req.readStatus,
          hasReplied: req.readStatus === 'replied',
          sentMessage: req.messages[0] ? {
            subject: req.messages[0].subject,
            body: req.messages[0].body,
            sentAt: req.messages[0].createdAt
          } : null
        }))
      }
    })

    // Build response
    const response: any = {
      success: true,
      requests: enrichedRequests
    }

    // Include draft requests if requested
    if (includeDrafts) {
      const draftRequestRecords = await prisma.request.findMany({
        where: {
          taskInstanceId,
          organizationId,
          isDraft: true
        },
        include: {
          entity: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              companyName: true
            }
          }
        },
        orderBy: { createdAt: "desc" }
      })

      // Resolve content for each draft using copy-on-write pattern
      const draftsWithContent = await Promise.all(
        draftRequestRecords.map(async (draft) => {
          const content = await RequestDraftCopyService.resolveDraftContent(draft)
          
          // Get source request info for display
          let sourceInfo = null
          if (draft.draftSourceRequestId) {
            const sourceRequest = await prisma.request.findUnique({
              where: { id: draft.draftSourceRequestId },
              select: {
                id: true,
                createdAt: true,
                taskInstance: {
                  select: {
                    name: true,
                    board: {
                      select: {
                        name: true,
                        periodStart: true,
                        periodEnd: true
                      }
                    }
                  }
                }
              }
            })
            if (sourceRequest) {
              sourceInfo = {
                requestId: sourceRequest.id,
                taskName: sourceRequest.taskInstance?.name,
                boardName: sourceRequest.taskInstance?.board?.name,
                periodStart: sourceRequest.taskInstance?.board?.periodStart,
                periodEnd: sourceRequest.taskInstance?.board?.periodEnd,
                createdAt: sourceRequest.createdAt
              }
            }
          }

          return {
            id: draft.id,
            isDraft: true,
            entityId: draft.entityId,
            entity: draft.entity,
            campaignName: draft.campaignName,
            campaignType: draft.campaignType,
            scheduleConfig: draft.scheduleConfig,
            scheduledSendAt: draft.scheduledSendAt,
            remindersEnabled: draft.remindersEnabled,
            remindersFrequencyHours: draft.remindersFrequencyHours,
            remindersMaxCount: draft.remindersMaxCount,
            createdAt: draft.createdAt,
            // Resolved content
            subject: content.subject,
            body: content.body,
            htmlBody: content.htmlBody,
            // Source info for "Copied from..." display
            sourceInfo,
            // Whether user has edited the content
            hasEdits: !!(draft.draftEditedSubject || draft.draftEditedBody || draft.draftEditedHtmlBody)
          }
        })
      )

      response.draftRequests = draftsWithContent
      response.hasDrafts = draftsWithContent.length > 0
    }

    return NextResponse.json(response)

  } catch (error: any) {
    console.error("Get task instance requests error:", error)
    return NextResponse.json(
      { error: "Failed to get requests", message: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST - Draft operations (send or update)
 * Body: { requestId: string, action: "send" | "update", ...actionParams }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = (session.user as any).role as UserRole || UserRole.MEMBER
    const { id: taskInstanceId } = await params

    // Verify task instance exists and user has edit access
    const instance = await TaskInstanceService.findById(taskInstanceId, organizationId)
    if (!instance) {
      return NextResponse.json({ error: "Task instance not found" }, { status: 404 })
    }

    const canEdit = await TaskInstanceService.canUserAccess(userId, userRole, instance, 'edit')
    if (!canEdit) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const body = await request.json()
    const { requestId, action } = body

    // Validate action
    if (!action || !["send", "update", "create_draft"].includes(action)) {
      return NextResponse.json({ error: "action must be 'send', 'update', or 'create_draft'" }, { status: 400 })
    }

    // Handle create_draft action (doesn't require requestId)
    if (action === "create_draft") {
      return handleCreateDraft(taskInstanceId, organizationId, userId, body)
    }

    // Other actions require requestId
    if (!requestId) {
      return NextResponse.json({ error: "requestId is required" }, { status: 400 })
    }

    // Handle update action
    if (action === "update") {
      return handleUpdateDraft(requestId, taskInstanceId, organizationId, body)
    }

    // Handle send action
    if (action === "send") {
      return handleSendDraft(requestId, taskInstanceId, organizationId, userId, body)
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })

  } catch (error: any) {
    console.error("Draft operation error:", error)
    return NextResponse.json(
      { error: "Failed to process draft operation", message: error.message },
      { status: 500 }
    )
  }
}

/**
 * DELETE - Delete a draft request
 * Body: { requestId: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = (session.user as any).role as UserRole || UserRole.MEMBER
    const { id: taskInstanceId } = await params

    // Verify task instance exists and user has edit access
    const instance = await TaskInstanceService.findById(taskInstanceId, organizationId)
    if (!instance) {
      return NextResponse.json({ error: "Task instance not found" }, { status: 404 })
    }

    const canEdit = await TaskInstanceService.canUserAccess(userId, userRole, instance, 'edit')
    if (!canEdit) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const body = await request.json()
    const { requestId } = body

    if (!requestId) {
      return NextResponse.json({ error: "requestId is required" }, { status: 400 })
    }

    // Delete the draft (only if it's actually a draft)
    const deleted = await RequestDraftCopyService.deleteDraft(requestId, organizationId)

    if (!deleted) {
      return NextResponse.json({ error: "Draft request not found" }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      message: "Draft request deleted"
    })

  } catch (error: any) {
    console.error("Delete draft request error:", error)
    return NextResponse.json(
      { error: "Failed to delete draft request", message: error.message },
      { status: 500 }
    )
  }
}

// ==================== Helper Functions ====================

/**
 * Create a new draft request for scheduled sending
 */
async function handleCreateDraft(
  taskInstanceId: string,
  organizationId: string,
  userId: string,
  body: any
): Promise<NextResponse> {
  const { 
    entityId, 
    subject, 
    body: bodyContent, 
    htmlBody,
    scheduleConfig,
    remindersEnabled = false,
    remindersFrequencyHours,
    remindersMaxCount
  } = body

  // Validate required fields
  if (!entityId) {
    return NextResponse.json({ error: "entityId is required" }, { status: 400 })
  }
  if (!subject || !bodyContent) {
    return NextResponse.json({ error: "subject and body are required" }, { status: 400 })
  }

  // Verify entity exists and belongs to organization
  const entity = await prisma.entity.findFirst({
    where: { id: entityId, organizationId }
  })
  if (!entity) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 })
  }

  // Get task instance with board for period-aware scheduling
  const taskInstance = await prisma.taskInstance.findFirst({
    where: { id: taskInstanceId, organizationId },
    include: {
      board: {
        select: { id: true, periodStart: true, periodEnd: true }
      }
    }
  })

  if (!taskInstance) {
    return NextResponse.json({ error: "Task instance not found" }, { status: 404 })
  }

  // Compute scheduledSendAt if period-aware scheduling
  let scheduledSendAt: Date | null = null
  const config = scheduleConfig as ScheduleConfig | null
  if (config?.mode === "period_aware" && taskInstance.board) {
    scheduledSendAt = BusinessDayService.computeFromConfig(
      config,
      taskInstance.board.periodStart,
      taskInstance.board.periodEnd
    )
  }

  // Generate a unique threadId
  const threadId = `draft-${Date.now()}-${Math.random().toString(36).substring(7)}`

  // Create the draft request
  const draft = await prisma.request.create({
    data: {
      organizationId,
      taskInstanceId,
      entityId,
      userId,
      threadId,
      campaignName: subject,
      campaignType: "SCHEDULED_REQUEST",
      status: "NO_REPLY",
      isDraft: true,
      
      // Store content directly (no source request to copy from)
      draftEditedSubject: subject,
      draftEditedBody: bodyContent,
      draftEditedHtmlBody: htmlBody || null,
      
      // Schedule config
      scheduleConfig: scheduleConfig || null,
      scheduledSendAt,
      deadlineDate: scheduledSendAt || taskInstance.dueDate,
      
      // Reminder config (disabled for scheduled drafts for now)
      remindersEnabled: false, // remindersEnabled,
      remindersFrequencyHours: null, // remindersFrequencyHours || 168,
      remindersMaxCount: null, // remindersMaxCount || 3,
      remindersApproved: false
    },
    include: {
      entity: {
        select: { id: true, firstName: true, lastName: true, email: true }
      }
    }
  })

  return NextResponse.json({
    success: true,
    message: "Draft request created",
    draft: {
      id: draft.id,
      entityId: draft.entityId,
      entity: draft.entity,
      subject,
      body: bodyContent,
      scheduleConfig,
      scheduledSendAt: draft.scheduledSendAt,
      isDraft: true,
      createdAt: draft.createdAt
    }
  })
}

async function handleUpdateDraft(
  requestId: string,
  taskInstanceId: string,
  organizationId: string,
  body: any
): Promise<NextResponse> {
  // Verify draft exists
  const existingDraft = await prisma.request.findFirst({
    where: {
      id: requestId,
      taskInstanceId,
      organizationId,
      isDraft: true
    }
  })

  if (!existingDraft) {
    return NextResponse.json({ error: "Draft request not found" }, { status: 404 })
  }

  const { subject, body: bodyContent, htmlBody, entityId, scheduleConfig } = body

  // Build update data (only include fields that were provided)
  const updateData: any = {}

  // Copy-on-write: store edited content
  if (subject !== undefined) {
    updateData.draftEditedSubject = subject
  }
  if (bodyContent !== undefined) {
    updateData.draftEditedBody = bodyContent
  }
  if (htmlBody !== undefined) {
    updateData.draftEditedHtmlBody = htmlBody
  }

  // Update recipient if provided
  if (entityId !== undefined) {
    updateData.entityId = entityId
  }

  // Update schedule config if provided
  if (scheduleConfig !== undefined) {
    updateData.scheduleConfig = scheduleConfig
  }

  const updated = await prisma.request.update({
    where: { id: requestId },
    data: updateData,
    include: {
      entity: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true
        }
      }
    }
  })

  // Resolve content for response
  const content = await RequestDraftCopyService.resolveDraftContent(updated)

  return NextResponse.json({
    success: true,
    draft: {
      ...updated,
      subject: content.subject,
      body: content.body,
      htmlBody: content.htmlBody,
      hasEdits: true
    }
  })
}

async function handleSendDraft(
  requestId: string,
  taskInstanceId: string,
  organizationId: string,
  userId: string,
  body: any
): Promise<NextResponse> {
  // Get the draft request with entity
  const draft = await prisma.request.findFirst({
    where: {
      id: requestId,
      taskInstanceId,
      organizationId,
      isDraft: true
    },
    include: {
      entity: true,
      taskInstance: {
        include: {
          board: {
            select: {
              id: true,
              periodStart: true,
              periodEnd: true
            }
          }
        }
      }
    }
  })

  if (!draft) {
    return NextResponse.json({ error: "Draft request not found" }, { status: 404 })
  }

  // Verify recipient exists and has email
  if (!draft.entity?.email) {
    return NextResponse.json(
      { error: "Draft request has no valid recipient. Please select a recipient before sending." },
      { status: 400 }
    )
  }

  const { remindersApproved = false } = body

  // Resolve content using copy-on-write pattern
  const content = await RequestDraftCopyService.resolveDraftContent(draft)

  if (!content.subject || !content.body) {
    return NextResponse.json(
      { error: "Draft request has no content. Please add subject and body before sending." },
      { status: 400 }
    )
  }

  // Get email account for sending
  let account = await EmailConnectionService.getAccountForUser(userId, organizationId)
  if (!account) {
    account = await EmailConnectionService.getPrimaryAccount(organizationId)
  }
  if (!account) {
    account = await EmailConnectionService.getFirstActive(organizationId)
  }
  if (!account) {
    return NextResponse.json({ error: "No email account available for sending" }, { status: 400 })
  }

  // Compute scheduled send time if period-aware
  const scheduleConfig = draft.scheduleConfig as ScheduleConfig | null
  let scheduledSendAt: Date | null = null
  
  if (scheduleConfig?.mode === "period_aware" && draft.taskInstance?.board) {
    scheduledSendAt = BusinessDayService.computeFromConfig(
      scheduleConfig,
      draft.taskInstance.board.periodStart,
      draft.taskInstance.board.periodEnd
    )
  }

  // Generate tracking token
  const trackingToken = TrackingPixelService.generateTrackingToken()
  const trackingUrl = TrackingPixelService.generateTrackingUrl(trackingToken)
  
  // Inject tracking pixel into HTML body
  let htmlBodyWithTracking = content.htmlBody || content.body
  if (htmlBodyWithTracking) {
    htmlBodyWithTracking = TrackingPixelService.injectTrackingPixel(htmlBodyWithTracking, trackingUrl)
  }

  // Send the email
  let sendResult: { messageId: string; providerData: any }
  const replyTo = account.email

  if (account.provider === EmailProvider.GMAIL) {
    const provider = new GmailProvider()
    sendResult = await provider.sendEmail({
      account,
      to: draft.entity.email,
      subject: content.subject,
      body: content.body,
      htmlBody: htmlBodyWithTracking,
      replyTo
    })
  } else if (account.provider === EmailProvider.MICROSOFT) {
    const provider = new MicrosoftProvider()
    sendResult = await provider.sendEmail({
      account,
      to: draft.entity.email,
      subject: content.subject,
      body: content.body,
      htmlBody: htmlBodyWithTracking,
      replyTo
    })
  } else {
    sendResult = await EmailSendingService.sendViaSMTP({
      account,
      to: draft.entity.email,
      subject: content.subject,
      body: content.body,
      htmlBody: htmlBodyWithTracking,
      replyTo
    })
  }

  // Log outbound message
  await RequestCreationService.logOutboundMessage({
    requestId: draft.id,
    entityId: draft.entityId!,
    subject: content.subject,
    body: content.body,
    htmlBody: htmlBodyWithTracking,
    fromAddress: account.email,
    toAddress: draft.entity.email,
    providerId: sendResult.messageId,
    providerData: sendResult.providerData,
    trackingToken
  })

  // Activate the draft (set isDraft = false)
  const activatedRequest = await prisma.request.update({
    where: { id: draft.id },
    data: {
      isDraft: false,
      scheduledSendAt,
      deadlineDate: scheduledSendAt || draft.deadlineDate,
      remindersApproved: draft.remindersEnabled && remindersApproved,
      replyToEmail: replyTo
    }
  })

  // Initialize reminder state if reminders are enabled and approved
  if (draft.remindersEnabled && remindersApproved) {
    await ReminderStateService.initializeForRequest(draft.id, {
      enabled: true,
      startDelayHours: draft.remindersStartDelayHours || 48,
      frequencyHours: draft.remindersFrequencyHours || 72,
      maxCount: draft.remindersMaxCount || 3,
      approved: true
    })
  }

  return NextResponse.json({
    success: true,
    message: "Draft request sent successfully",
    request: {
      id: activatedRequest.id,
      status: activatedRequest.status,
      isDraft: activatedRequest.isDraft,
      scheduledSendAt: activatedRequest.scheduledSendAt,
      messageId: sendResult.messageId
    }
  })
}
